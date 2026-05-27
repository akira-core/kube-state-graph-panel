import { renderHook, act } from '@testing-library/react';
import cytoscape from 'cytoscape';
import type { MutableRefObject } from 'react';

import { useGraphResize } from './useGraphResize';

interface ObserverHandle {
  trigger: () => void;
  disconnect: jest.Mock;
  observe: jest.Mock;
}

function installResizeObserver(): ObserverHandle {
  const handle: ObserverHandle = {
    trigger: () => {
      /* replaced below */
    },
    disconnect: jest.fn(),
    observe: jest.fn(),
  };
  const RO = class {
    constructor(cb: () => void) {
      handle.trigger = cb;
    }
    observe = handle.observe;
    disconnect = handle.disconnect;
    unobserve = jest.fn();
  };
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
  return handle;
}

describe('useGraphResize', () => {
  const realRO = globalThis.ResizeObserver;
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = realRO;
  });

  it('debounces resize callbacks and triggers cy.resize + cy.fit once', () => {
    const handle = installResizeObserver();
    const cy = cytoscape({ headless: true, styleEnabled: true });
    const resizeSpy = jest.spyOn(cy, 'resize');
    const fitSpy = jest.spyOn(cy, 'fit');

    const container = document.createElement('div');
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
    const containerRef = { current: container } as MutableRefObject<HTMLDivElement | null>;

    renderHook(() => useGraphResize({ cyRef, containerRef }));

    expect(handle.observe).toHaveBeenCalledWith(container);

    act(() => {
      handle.trigger();
      handle.trigger();
      handle.trigger();
      jest.advanceTimersByTime(99);
    });
    expect(resizeSpy).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(resizeSpy).toHaveBeenCalledTimes(1);
    expect(fitSpy).toHaveBeenCalledTimes(1);
  });

  it('disconnects observer on unmount', () => {
    const handle = installResizeObserver();
    const container = document.createElement('div');
    const cyRef = { current: null } as MutableRefObject<cytoscape.Core | null>;
    const containerRef = { current: container } as MutableRefObject<HTMLDivElement | null>;

    const { unmount } = renderHook(() => useGraphResize({ cyRef, containerRef }));
    unmount();
    expect(handle.disconnect).toHaveBeenCalled();
  });

  it('is a no-op when containerRef is null', () => {
    installResizeObserver();
    const cyRef = { current: null } as MutableRefObject<cytoscape.Core | null>;
    const containerRef = { current: null } as MutableRefObject<HTMLDivElement | null>;
    expect(() => {
      renderHook(() => useGraphResize({ cyRef, containerRef }));
    }).not.toThrow();
  });
});
