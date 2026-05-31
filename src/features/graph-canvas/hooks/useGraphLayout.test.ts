import { renderHook } from '@testing-library/react';
import cytoscape from 'cytoscape';
import type { MutableRefObject } from 'react';

import { useGraphLayout, type LayoutName } from './useGraphLayout';

function makeCy(): cytoscape.Core {
  return cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [{ group: 'nodes', data: { id: 'a' } }],
  });
}

function stubLayout(cy: cytoscape.Core): { layoutSpy: jest.SpyInstance; runMock: jest.Mock } {
  const runMock = jest.fn();
  const fakeLayout = { run: runMock } as unknown as cytoscape.Layouts;
  const layoutSpy = jest.spyOn(cy, 'layout').mockReturnValue(fakeLayout);
  return { layoutSpy, runMock };
}

describe('useGraphLayout', () => {
  it('calls cy.stop() then cy.layout(options).run() on mount', () => {
    const cy = makeCy();
    const stopSpy = jest.spyOn(cy, 'stop');
    const { layoutSpy, runMock } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    renderHook(() => useGraphLayout({ cyRef, name: 'fcose' }));

    expect(stopSpy).toHaveBeenCalled();
    expect(layoutSpy).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledTimes(1);
    const [arg] = layoutSpy.mock.calls[0] as [{ name: string }];
    expect(arg.name).toBe('fcose');
  });

  it('reruns layout when name changes', () => {
    const cy = makeCy();
    const { layoutSpy, runMock } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    const { rerender } = renderHook(({ name }: { name: LayoutName }) => useGraphLayout({ cyRef, name }), {
      initialProps: { name: 'fcose' as LayoutName },
    });
    expect(layoutSpy).toHaveBeenCalledTimes(1);

    rerender({ name: 'dagre' as LayoutName });
    expect(layoutSpy).toHaveBeenCalledTimes(2);
    expect(runMock).toHaveBeenCalledTimes(2);
    const [secondArg] = layoutSpy.mock.calls[1] as [{ name: string }];
    expect(secondArg.name).toBe('dagre');
  });

  it('does not rerun layout when name is unchanged across renders', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    const { rerender } = renderHook(({ name }: { name: LayoutName }) => useGraphLayout({ cyRef, name }), {
      initialProps: { name: 'fcose' as LayoutName },
    });
    expect(layoutSpy).toHaveBeenCalledTimes(1);

    rerender({ name: 'fcose' as LayoutName });
    expect(layoutSpy).toHaveBeenCalledTimes(1); // memoized options keep effect from re-firing
  });

  it('is a no-op when cyRef is null', () => {
    const cyRef = { current: null } as MutableRefObject<cytoscape.Core | null>;
    expect(() => {
      renderHook(() => useGraphLayout({ cyRef, name: 'fcose' }));
    }).not.toThrow();
  });

  it('reruns layout when runToken changes', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
    const { rerender } = renderHook(
      ({ runToken }: { runToken: number }) => useGraphLayout({ cyRef, name: 'fcose', runToken }),
      { initialProps: { runToken: 0 } }
    );
    expect(layoutSpy).toHaveBeenCalledTimes(1);
    rerender({ runToken: 1 });
    expect(layoutSpy).toHaveBeenCalledTimes(2);
  });

  it('does not rerun layout when runToken is unchanged across renders', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
    const { rerender } = renderHook(
      ({ runToken }: { runToken: number }) => useGraphLayout({ cyRef, name: 'fcose', runToken }),
      { initialProps: { runToken: 0 } }
    );
    expect(layoutSpy).toHaveBeenCalledTimes(1);
    rerender({ runToken: 0 });
    expect(layoutSpy).toHaveBeenCalledTimes(1);
  });

  it('defaults runToken to 0 so existing mount-only callers run layout exactly once', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
    renderHook(() => useGraphLayout({ cyRef, name: 'fcose' })); // no runToken passed
    expect(layoutSpy).toHaveBeenCalledTimes(1);
  });
});
