import { renderHook } from '@testing-library/react';
import type cytoscape from 'cytoscape';

// locationService stub shared by every case — dereferenced lazily inside the
// service getters, so hoisting order is safe.
const partialMock = jest.fn();
const getSearchMock = jest.fn(() => new URLSearchParams());
jest.mock('@grafana/runtime', () => ({
  locationService: {
    getSearch: (): URLSearchParams => getSearchMock(),
    partial: (query: Record<string, unknown>, replace?: boolean): void => {
      partialMock(query, replace);
    },
  },
}));

import { useVariableExport } from './useVariableExport';

function pod(id: string, label: string): cytoscape.ElementDefinition {
  return { group: 'nodes', data: { id, kind: 'pod', label } };
}

describe('useVariableExport', () => {
  beforeEach(() => {
    partialMock.mockClear();
    getSearchMock.mockReset();
    getSearchMock.mockReturnValue(new URLSearchParams());
  });

  it('does nothing when the variable name is empty', () => {
    renderHook(() => {
      useVariableExport([pod('p1', 'mongo-0')], '', true);
    });
    expect(getSearchMock).not.toHaveBeenCalled();
    expect(partialMock).not.toHaveBeenCalled();
  });

  it('does nothing when the variable name is whitespace only', () => {
    renderHook(() => {
      useVariableExport([pod('p1', 'mongo-0')], '   ', true);
    });
    expect(partialMock).not.toHaveBeenCalled();
  });

  it('does nothing while disabled (error / first-load gate)', () => {
    renderHook(() => {
      useVariableExport([pod('p1', 'mongo-0')], 'pod_list', false);
    });
    expect(getSearchMock).not.toHaveBeenCalled();
    expect(partialMock).not.toHaveBeenCalled();
  });

  it('writes the pod names once for a stable element list across re-renders', () => {
    const elements = [pod('p2', 'mongo-1'), pod('p1', 'mongo-0')];
    const { rerender } = renderHook(() => {
      useVariableExport(elements, 'pod_list', true);
    });
    rerender();
    rerender();
    expect(partialMock).toHaveBeenCalledTimes(1);
    expect(partialMock).toHaveBeenCalledWith({ 'var-pod_list': ['mongo-0', 'mongo-1'] }, true);
  });

  it('writes again when the element list gains a pod', () => {
    const { rerender } = renderHook(
      ({ elements }: { elements: cytoscape.ElementDefinition[] }) => {
        useVariableExport(elements, 'pod_list', true);
      },
      { initialProps: { elements: [pod('p1', 'mongo-0')] } }
    );
    rerender({ elements: [pod('p1', 'mongo-0'), pod('p3', 'nats-0')] });
    expect(partialMock).toHaveBeenCalledTimes(2);
    expect(partialMock).toHaveBeenLastCalledWith({ 'var-pod_list': ['mongo-0', 'nats-0'] }, true);
  });

  it('starts writing when the gate opens', () => {
    const elements = [pod('p1', 'mongo-0')];
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        useVariableExport(elements, 'pod_list', enabled);
      },
      { initialProps: { enabled: false } }
    );
    expect(partialMock).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(partialMock).toHaveBeenCalledWith({ 'var-pod_list': ['mongo-0'] }, true);
  });
});
