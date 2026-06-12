import { renderHook } from '@testing-library/react';
import type cytoscape from 'cytoscape';

// Mock the feature's write boundary: the hook's job is WHEN to write (gating,
// memo stability), not the var- URL wire format — writeDashboardVariable.test.ts
// pins that. Dereferenced lazily inside the factory, so hoisting order is safe.
const writeVariableMock = jest.fn();
jest.mock('./writeDashboardVariable', () => ({
  writeDashboardVariable: (name: string, values: readonly string[]): void => {
    writeVariableMock(name, values);
  },
}));

import { useVariableExport } from './useVariableExport';

function pod(id: string, label: string): cytoscape.ElementDefinition {
  return { group: 'nodes', data: { id, kind: 'pod', label } };
}

describe('useVariableExport', () => {
  beforeEach(() => {
    writeVariableMock.mockClear();
  });

  it('does nothing when the variable name is empty or whitespace only', () => {
    for (const name of ['', '   ']) {
      renderHook(() => {
        useVariableExport([pod('p1', 'mongo-0')], name, true);
      });
    }
    expect(writeVariableMock).not.toHaveBeenCalled();
  });

  it('does nothing while disabled (error / first-load gate)', () => {
    renderHook(() => {
      useVariableExport([pod('p1', 'mongo-0')], 'pod_list', false);
    });
    expect(writeVariableMock).not.toHaveBeenCalled();
  });

  it('writes the pod names once for a stable element list across re-renders', () => {
    const elements = [pod('p2', 'mongo-1'), pod('p1', 'mongo-0')];
    const { rerender } = renderHook(() => {
      useVariableExport(elements, 'pod_list', true);
    });
    rerender();
    rerender();
    expect(writeVariableMock).toHaveBeenCalledTimes(1);
    expect(writeVariableMock).toHaveBeenCalledWith('pod_list', ['mongo-0', 'mongo-1']);
  });

  it('writes again when the element list gains a pod', () => {
    const { rerender } = renderHook(
      ({ elements }: { elements: cytoscape.ElementDefinition[] }) => {
        useVariableExport(elements, 'pod_list', true);
      },
      { initialProps: { elements: [pod('p1', 'mongo-0')] } }
    );
    rerender({ elements: [pod('p1', 'mongo-0'), pod('p3', 'nats-0')] });
    expect(writeVariableMock).toHaveBeenCalledTimes(2);
    expect(writeVariableMock).toHaveBeenLastCalledWith('pod_list', ['mongo-0', 'nats-0']);
  });

  it('starts writing when the gate opens', () => {
    const elements = [pod('p1', 'mongo-0')];
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        useVariableExport(elements, 'pod_list', enabled);
      },
      { initialProps: { enabled: false } }
    );
    expect(writeVariableMock).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(writeVariableMock).toHaveBeenCalledWith('pod_list', ['mongo-0']);
  });
});
