import { renderHook } from '@testing-library/react';

// Mock the feature's write boundary (mirrors useVariableExport.test): the hook's job is
// WHEN/WHAT to write, not the var- URL wire format (writeDashboardVariable.test pins that).
const writeVariableMock = jest.fn();
jest.mock('./writeDashboardVariable', () => ({
  writeDashboardVariable: (name: string, values: readonly string[]): void => {
    writeVariableMock(name, values);
  },
}));

import type { SelectedPodExportInput } from './selectedPodExportValue';
import { useSelectedPodExport } from './useSelectedPodExport';

const critical: SelectedPodExportInput = { kind: 'pod', status: 'critical', label: 'mongo-0' };
const normal: SelectedPodExportInput = { kind: 'pod', status: 'normal', label: 'mongo-0' };

describe('useSelectedPodExport', () => {
  beforeEach(() => {
    writeVariableMock.mockClear();
  });

  it('does nothing when the variable name is empty or whitespace (disabled)', () => {
    for (const name of ['', '   ']) {
      renderHook(() => {
        useSelectedPodExport(critical, true, name, true);
      });
    }
    expect(writeVariableMock).not.toHaveBeenCalled();
  });

  it('does nothing while the enabled flag is false', () => {
    renderHook(() => {
      useSelectedPodExport(critical, true, 'selected_pod', false);
    });
    expect(writeVariableMock).not.toHaveBeenCalled();
  });

  it('writes [label] for a left-click non-normal pod', () => {
    renderHook(() => {
      useSelectedPodExport(critical, true, 'selected_pod', true);
    });
    expect(writeVariableMock).toHaveBeenCalledWith('selected_pod', ['mongo-0']);
  });

  it('clears ([]) for a normal pod, a non-pod, a right-click, and no selection', () => {
    const cases: Array<[SelectedPodExportInput | null, boolean]> = [
      [normal, true],
      [{ kind: 'service', status: 'critical', label: 'svc' }, true],
      [critical, false], // right-click
      [null, true],
    ];
    for (const [node, isLeftClick] of cases) {
      writeVariableMock.mockClear();
      renderHook(() => {
        useSelectedPodExport(node, isLeftClick, 'selected_pod', true);
      });
      expect(writeVariableMock).toHaveBeenCalledWith('selected_pod', []);
    }
  });

  it('writes once for a stable selection across re-renders (value-fingerprinted effect)', () => {
    const { rerender } = renderHook(() => {
      useSelectedPodExport(critical, true, 'selected_pod', true);
    });
    rerender();
    rerender();
    expect(writeVariableMock).toHaveBeenCalledTimes(1);
  });

  it('writes again when the selection changes to a different pod', () => {
    const { rerender } = renderHook(
      ({ node }: { node: SelectedPodExportInput }) => {
        useSelectedPodExport(node, true, 'selected_pod', true);
      },
      { initialProps: { node: critical } }
    );
    rerender({ node: { kind: 'pod', status: 'warning', label: 'web-1' } });
    expect(writeVariableMock).toHaveBeenCalledTimes(2);
    expect(writeVariableMock).toHaveBeenLastCalledWith('selected_pod', ['web-1']);
  });
});
