import { render, act, renderHook } from '@testing-library/react';
import cytoscape from 'cytoscape';
import React, { type MutableRefObject } from 'react';

import { useCytoscape, type CyStylesheet } from './useCytoscape';

interface HarnessProps {
  elements: cytoscape.ElementDefinition[];
  stylesheet: CyStylesheet[];
  onReady?: (cy: cytoscape.Core) => void;
}

function Harness(props: Readonly<HarnessProps>): React.JSX.Element {
  const { elements, stylesheet, onReady } = props;
  const { containerRef, cyRef } = useCytoscape({ elements, stylesheet });
  React.useEffect(() => {
    if (cyRef.current !== null && onReady !== undefined) {
      onReady(cyRef.current);
    }
  }, [cyRef, onReady]);
  return <div ref={containerRef} style={{ width: 200, height: 200 }} data-testid="container" />;
}

const baseStylesheet: CyStylesheet[] = [{ selector: 'node', style: { 'background-color': '#000' } }];

describe('useCytoscape', () => {
  it('creates a cytoscape instance on mount and destroys it on unmount', () => {
    let capturedCy: cytoscape.Core | null = null;
    const { unmount } = render(
      <Harness
        elements={[{ group: 'nodes', data: { id: 'a' } }]}
        stylesheet={baseStylesheet}
        onReady={(cy): void => {
          capturedCy = cy;
        }}
      />
    );

    expect(capturedCy).not.toBeNull();
    const cy = capturedCy!;
    // Spies installed post-mount only verify the unmount path; a future
    // regression where useCytoscape calls destroy during mount would not be
    // caught here. Acceptable trade-off vs mocking the cytoscape factory.
    const destroySpy = jest.spyOn(cy, 'destroy');
    const removeAllSpy = jest.spyOn(cy, 'removeAllListeners');

    unmount();

    expect(removeAllSpy).toHaveBeenCalled();
    expect(destroySpy).toHaveBeenCalled();
  });

  it('init does not auto-run a layout extension (proves preset init layout)', () => {
    // If init used { name: 'fcose' }, cytoscape would throw "No such layout `fcose` found"
    // here because the extension is never registered in the jest environment.
    // A clean mount with no extension-missing error is the assertion.
    expect(() => {
      render(<Harness elements={[{ group: 'nodes', data: { id: 'a' } }]} stylesheet={baseStylesheet} />);
    }).not.toThrow();
  });

  it('applies element diffs without rebuilding the instance', () => {
    let capturedCy: cytoscape.Core | null = null;
    const onReady = (cy: cytoscape.Core): void => {
      capturedCy = cy;
    };
    const { rerender } = render(
      <Harness elements={[{ group: 'nodes', data: { id: 'a' } }]} stylesheet={baseStylesheet} onReady={onReady} />
    );

    const cyBefore: cytoscape.Core | null = capturedCy;
    expect(cyBefore!.nodes().length).toBe(1);

    act(() => {
      rerender(
        <Harness
          elements={[
            { group: 'nodes', data: { id: 'a' } },
            { group: 'nodes', data: { id: 'b' } },
          ]}
          stylesheet={baseStylesheet}
          onReady={onReady}
        />
      );
    });

    expect(capturedCy).toBe(cyBefore); // same instance, not rebuilt
    expect(capturedCy!.nodes().length).toBe(2);
  });

  it('swaps stylesheet without rebuilding the instance', () => {
    let capturedCy: cytoscape.Core | null = null;
    const onReady = (cy: cytoscape.Core): void => {
      capturedCy = cy;
    };
    const { rerender } = render(<Harness elements={[]} stylesheet={baseStylesheet} onReady={onReady} />);

    const cyBefore = capturedCy!;
    const styleSpy = jest.spyOn(cyBefore, 'style');

    const nextStylesheet: CyStylesheet[] = [{ selector: 'node', style: { 'background-color': '#fff' } }];
    act(() => {
      rerender(<Harness elements={[]} stylesheet={nextStylesheet} onReady={onReady} />);
    });

    expect(capturedCy).toBe(cyBefore);
    expect(styleSpy).toHaveBeenCalledWith(nextStylesheet);
  });

  it('flips isReady to true once the instance exists (so dependents can re-bind)', () => {
    function ReadyHarness(): React.JSX.Element {
      const { containerRef, isReady } = useCytoscape({ elements: [], stylesheet: baseStylesheet });
      return <div ref={containerRef} data-testid="ready" data-ready={String(isReady)} />;
    }
    const { getByTestId } = render(<ReadyHarness />);
    expect(getByTestId('ready').getAttribute('data-ready')).toBe('true');
  });
});

const baseElements: cytoscape.ElementDefinition[] = [
  { group: 'nodes', data: { id: 'cl', isCluster: true } },
  { group: 'nodes', data: { id: 'p1', parent: 'cl', kind: 'pod' } },
];

describe('useCytoscape collapse-aware diff-patch', () => {
  it('expands all, patches, then re-collapses present parents and reports prune in order', () => {
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: baseElements });
    const order: string[] = [];
    const states: boolean[] = [];
    const suppressRef = { current: false };
    const api = {
      expandAll: jest.fn(() => {
        states.push(suppressRef.current);
        order.push('expandAll');
      }),
      collapse: jest.fn(() => order.push('collapse')),
    } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set(['cl']) } as MutableRefObject<ReadonlySet<string>>;
    const onCollapsedChange = jest.fn();

    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef,
          onCollapsedChange,
        }),
      { initialProps: { elements: baseElements } }
    );
    result.current.cyRef.current = cy;
    rerender({ elements: [...baseElements, { group: 'nodes', data: { id: 'p2', parent: 'cl', kind: 'pod' } }] });

    expect(order[0]).toBe('expandAll');
    expect(order).toContain('collapse');
    expect(order.indexOf('expandAll')).toBeLessThan(order.indexOf('collapse'));
    expect(states[0]).toBe(true);
    expect(suppressRef.current).toBe(false);
    expect(onCollapsedChange).not.toHaveBeenCalled();
    cy.destroy();
  });

  it('collapses exactly the reconciled parents, even when ids contain CSS-special chars', () => {
    const slashElements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'cluster/demo', isCluster: true } },
      { group: 'nodes', data: { id: 'demo/p1', parent: 'cluster/demo', kind: 'pod' } },
    ];
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: slashElements });
    const collapseArgIds: string[][] = [];
    const api = {
      expandAll: jest.fn(),
      collapse: jest.fn((eles: cytoscape.NodeCollection) => {
        collapseArgIds.push(eles.map((n) => n.id()));
      }),
    } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set(['cluster/demo']) } as MutableRefObject<ReadonlySet<string>>;
    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef: { current: false },
          onCollapsedChange: jest.fn(),
        }),
      { initialProps: { elements: slashElements } }
    );
    result.current.cyRef.current = cy;
    rerender({
      elements: [...slashElements, { group: 'nodes', data: { id: 'demo/p2', parent: 'cluster/demo', kind: 'pod' } }],
    });
    expect(collapseArgIds.at(-1)).toEqual(['cluster/demo']);
    cy.destroy();
  });

  it('prunes removed parents and reports the shrunken Set', () => {
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: baseElements });
    const api = { expandAll: jest.fn(), collapse: jest.fn() } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set(['cl', 'ghost']) } as MutableRefObject<ReadonlySet<string>>;
    const onCollapsedChange = jest.fn();
    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef: { current: false },
          onCollapsedChange,
        }),
      { initialProps: { elements: baseElements } }
    );
    result.current.cyRef.current = cy;
    rerender({ elements: [...baseElements, { group: 'nodes', data: { id: 'p2', parent: 'cl', kind: 'pod' } }] });
    expect(onCollapsedChange).toHaveBeenCalledWith(new Set(['cl']));
    cy.destroy();
  });

  it('applies collapse on collapseKey change with UNCHANGED elements (legend toggle fix)', () => {
    // Proves the bug fix: a collapseKey bump (collapsed-set content change) triggers
    // the diff-patch effect even when elements are identical, so legend toggles are
    // applied immediately rather than waiting for the next data refresh.
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: baseElements });
    const collapseArgIds: string[][] = [];
    const expandAllCalls: number[] = [];
    let callIndex = 0;
    const api = {
      expandAll: jest.fn(() => {
        expandAllCalls.push(callIndex++);
      }),
      collapse: jest.fn((eles: cytoscape.NodeCollection) => {
        collapseArgIds.push(eles.map((n) => n.id()));
      }),
    } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set<string>() } as MutableRefObject<ReadonlySet<string>>;
    const suppressRef = { current: false };

    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[]; collapseKey: number }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef,
          onCollapsedChange: jest.fn(),
          collapseKey: props.collapseKey,
        }),
      { initialProps: { elements: baseElements, collapseKey: 0 } }
    );
    result.current.cyRef.current = cy;

    // --- Collapse case: set desired={"cl"}, bump key (elements unchanged) ---
    collapsedIdsRef.current = new Set(['cl']);
    rerender({ elements: baseElements, collapseKey: 1 });

    // expandAll must have been called (restores graph before diff)
    expect(expandAllCalls.length).toBeGreaterThanOrEqual(1);
    // collapse must have been called and include 'cl'
    expect(collapseArgIds.length).toBeGreaterThanOrEqual(1);
    const lastCollapseIds = collapseArgIds.at(-1) ?? [];
    expect(lastCollapseIds).toContain('cl');

    // --- Expand case: clear desired set, bump key again (elements still unchanged) ---
    const collapseCallsBefore = collapseArgIds.length;
    collapsedIdsRef.current = new Set<string>();
    rerender({ elements: baseElements, collapseKey: 2 });

    // expandAll called again (restores the collapsed graph)
    expect(expandAllCalls.length).toBeGreaterThan(1);
    // collapse should NOT have been called with 'cl' on this rerender
    // (desired set is empty → reconcileCollapse returns [] → api.collapse not invoked)
    const newCalls = collapseArgIds.slice(collapseCallsBefore);
    const recollapseWithCl = newCalls.some((ids) => ids.includes('cl'));
    expect(recollapseWithCl).toBe(false);

    cy.destroy();
  });
});
