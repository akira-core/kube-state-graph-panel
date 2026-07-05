import { renderHook } from '@testing-library/react';

// Mock the feature's write boundary: the hook's job is WHEN to write (gating,
// fingerprint stability), not the var- URL wire format — writeDashboardVariable.test.ts
// pins that. Dereferenced lazily inside the factory, so hoisting order is safe.
const writeVariableMock = jest.fn();
jest.mock('./writeDashboardVariable', () => ({
  writeDashboardVariable: (name: string, values: readonly string[]): void => {
    writeVariableMock(name, values);
  },
}));

import { useListVariableExport } from './useListVariableExport';

describe('useListVariableExport', () => {
  beforeEach(() => {
    writeVariableMock.mockClear();
  });

  it('does nothing when the variable name is empty or whitespace only, regardless of enabled', () => {
    for (const name of ['', '   ']) {
      for (const enabled of [true, false]) {
        renderHook(() => {
          useListVariableExport(['mongo-2', 'mesh-gateway-0'], name, enabled);
        });
      }
    }
    expect(writeVariableMock).not.toHaveBeenCalled();
  });

  it('does nothing while disabled (error / first-load gate) when values is non-empty', () => {
    renderHook(() => {
      useListVariableExport(['mongo-2'], 'alert_pod_list', false);
    });
    expect(writeVariableMock).not.toHaveBeenCalled();
  });

  // Critical guarantee: a failed query or not-yet-loaded panel must never be
  // mistaken for "confirmed zero alerts" and written out as the $__empty
  // sentinel. `enabled` must gate the effect BEFORE it ever reaches
  // writeDashboardVariable, even when values is (innocuously) empty.
  it('does nothing while disabled even when values is empty (must not write the $__empty sentinel during an error/loading state)', () => {
    renderHook(() => {
      useListVariableExport([], 'alert_pod_list', false);
    });
    expect(writeVariableMock).not.toHaveBeenCalled();
  });

  it('writes the values once for a stable list across re-renders', () => {
    const values = ['mesh-gateway-0', 'mongo-2'];
    const { rerender } = renderHook(() => {
      useListVariableExport(values, 'alert_pod_list', true);
    });
    rerender();
    rerender();
    expect(writeVariableMock).toHaveBeenCalledTimes(1);
    expect(writeVariableMock).toHaveBeenCalledWith('alert_pod_list', [
      'mesh-gateway-0',
      'mongo-2',
    ]);
  });

  it('supports multi-value arrays end to end via writeDashboardVariable', () => {
    renderHook(() => {
      useListVariableExport(
        ['KubeNodeMemoryPressure', 'KubePodCrashLooping', 'VolumeNearFull'],
        'alert_names',
        true
      );
    });
    expect(writeVariableMock).toHaveBeenCalledTimes(1);
    expect(writeVariableMock).toHaveBeenCalledWith('alert_names', [
      'KubeNodeMemoryPressure',
      'KubePodCrashLooping',
      'VolumeNearFull',
    ]);
  });

  it('writes again when the value list changes content', () => {
    const { rerender } = renderHook(
      ({ values }: { values: readonly string[] }) => {
        useListVariableExport(values, 'alert_pod_list', true);
      },
      { initialProps: { values: ['mongo-2'] } }
    );
    rerender({ values: ['mongo-2', 'nats-0'] });
    expect(writeVariableMock).toHaveBeenCalledTimes(2);
    expect(writeVariableMock).toHaveBeenLastCalledWith('alert_pod_list', ['mongo-2', 'nats-0']);
  });

  // The fingerprint must key the effect by CONTENT, not by array identity —
  // callers may legitimately hand in a fresh array instance each render
  // (e.g. from a re-run useMemo whose deps happened not to change referentially
  // upstream). A same-content, same-order re-render must not refire the write.
  it('does not refire when a new array instance has the same content and order', () => {
    const { rerender } = renderHook(
      ({ values }: { values: readonly string[] }) => {
        useListVariableExport(values, 'alert_pod_list', true);
      },
      { initialProps: { values: ['mesh-gateway-0', 'mongo-2'] } }
    );
    rerender({ values: ['mesh-gateway-0', 'mongo-2'] });
    rerender({ values: ['mesh-gateway-0', 'mongo-2'] });
    expect(writeVariableMock).toHaveBeenCalledTimes(1);
  });

  it('starts writing when the gate opens', () => {
    const values = ['mongo-2'];
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        useListVariableExport(values, 'alert_pod_list', enabled);
      },
      { initialProps: { enabled: false } }
    );
    expect(writeVariableMock).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(writeVariableMock).toHaveBeenCalledWith('alert_pod_list', ['mongo-2']);
  });
});
