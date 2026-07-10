import { renderHook } from '@testing-library/react';
import type cytoscape from 'cytoscape';

// Mock the feature's write boundary (mirrors useListVariableExport.test.ts): the hook's job is
// WHEN/WHAT to write per variable, not the var- URL wire format (writeDashboardVariable.test.ts
// pins that). Dereferenced lazily inside the factory, so hoisting order is safe.
const writeVariableMock = jest.fn();
jest.mock('./writeDashboardVariable', () => ({
  writeDashboardVariable: (name: string, values: readonly string[]): void => {
    writeVariableMock(name, values);
  },
}));

import { useNodeClickExport } from './useNodeClickExport';

// nodeClickExportValues is exercised for real (not mocked) — same approach as the
// KsgPanel tests exercising extractAlertPodNames for real — so these fixtures pin
// the hook's wiring, not the pure function's decision table (nodeClickExportValues.test
// owns that).
const podElements: cytoscape.ElementDefinition[] = [
  { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
  { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', parent: 'cl' } },
];

const controllerElements: cytoscape.ElementDefinition[] = [
  { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
  { group: 'nodes', data: { id: 'ctrl', kind: 'statefulset', label: 'mongo', isController: true, parent: 'cl' } },
  { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-2', parent: 'ctrl' } },
  { group: 'nodes', data: { id: 'p2', kind: 'pod', label: 'mongo-0', parent: 'ctrl' } },
  { group: 'nodes', data: { id: 'p3', kind: 'pod', label: 'mongo-1', parent: 'ctrl' } },
];

describe('useNodeClickExport', () => {
  beforeEach(() => {
    writeVariableMock.mockClear();
  });

  it('does nothing when both variable names are empty or whitespace (both disabled)', () => {
    for (const name of ['', '   ']) {
      renderHook(() => {
        useNodeClickExport(podElements, 'p1', name, name);
      });
    }
    expect(writeVariableMock).not.toHaveBeenCalled();
  });

  it('writes only the pod variable when clusterVariable is empty', () => {
    renderHook(() => {
      useNodeClickExport(podElements, 'p1', 'selected_pod', '');
    });
    expect(writeVariableMock).toHaveBeenCalledTimes(1);
    expect(writeVariableMock).toHaveBeenCalledWith('selected_pod', ['mongo-0']);
  });

  it('writes only the cluster variable when podVariable is empty', () => {
    renderHook(() => {
      useNodeClickExport(podElements, 'p1', '', 'cluster_sel');
    });
    expect(writeVariableMock).toHaveBeenCalledTimes(1);
    expect(writeVariableMock).toHaveBeenCalledWith('cluster_sel', ['prod']);
  });

  it('writes both variables independently for a pod click', () => {
    renderHook(() => {
      useNodeClickExport(podElements, 'p1', 'selected_pod', 'cluster_sel');
    });
    expect(writeVariableMock).toHaveBeenCalledTimes(2);
    expect(writeVariableMock).toHaveBeenCalledWith('selected_pod', ['mongo-0']);
    expect(writeVariableMock).toHaveBeenCalledWith('cluster_sel', ['prod']);
  });

  it('writes the full sorted+deduped multi-value pod array for a controller click', () => {
    renderHook(() => {
      useNodeClickExport(controllerElements, 'ctrl', 'selected_pod', 'cluster_sel');
    });
    expect(writeVariableMock).toHaveBeenCalledWith('selected_pod', ['mongo-0', 'mongo-1', 'mongo-2']);
    expect(writeVariableMock).toHaveBeenCalledWith('cluster_sel', ['prod']);
  });

  it('clears both variables when the selection is cleared (background click)', () => {
    renderHook(() => {
      useNodeClickExport(podElements, null, 'selected_pod', 'cluster_sel');
    });
    expect(writeVariableMock).toHaveBeenCalledTimes(2);
    expect(writeVariableMock).toHaveBeenCalledWith('selected_pod', []);
    expect(writeVariableMock).toHaveBeenCalledWith('cluster_sel', []);
  });

  it('writes each variable at most once for a stable selection across re-renders (fingerprint dedup)', () => {
    const { rerender } = renderHook(() => {
      useNodeClickExport(podElements, 'p1', 'selected_pod', 'cluster_sel');
    });
    rerender();
    rerender();
    expect(writeVariableMock).toHaveBeenCalledTimes(2);
  });

  it('does not spuriously refire the pod effect when only the cluster value changes', () => {
    // Same pod label ('mongo-0'), different cluster ancestor ('prod' -> 'dr') — each
    // variable's effect is keyed on its OWN value fingerprint (design D2/D6), so the
    // unrelated cluster change must not cause an extra pod write.
    const rehomedElements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'cl2', label: 'dr', isCluster: true, cluster: 'dr' } },
      { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', parent: 'cl2' } },
    ];
    const { rerender } = renderHook(
      ({ elements }: { elements: cytoscape.ElementDefinition[] }) => {
        useNodeClickExport(elements, 'p1', 'selected_pod', 'cluster_sel');
      },
      { initialProps: { elements: podElements } }
    );
    writeVariableMock.mockClear();
    rerender({ elements: rehomedElements });

    const podCalls = writeVariableMock.mock.calls.filter(([name]) => name === 'selected_pod');
    const clusterCalls = writeVariableMock.mock.calls.filter(([name]) => name === 'cluster_sel');
    expect(podCalls).toHaveLength(0);
    expect(clusterCalls).toHaveLength(1);
    expect(clusterCalls[0]).toEqual(['cluster_sel', ['dr']]);
  });
});
