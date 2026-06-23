import { selectedPodExportValue, type SelectedPodExportInput } from './selectedPodExportValue';

const pod = (status: SelectedPodExportInput['status'], label = 'mongo-0'): SelectedPodExportInput => ({
  kind: 'pod',
  label,
  ...(status !== undefined ? { status } : {}),
});

describe('selectedPodExportValue', () => {
  it('returns [label] for a left-click critical or warning pod', () => {
    expect(selectedPodExportValue(pod('critical'), true)).toEqual(['mongo-0']);
    expect(selectedPodExportValue(pod('warning', 'web-1'), true)).toEqual(['web-1']);
  });

  it('returns [] for a left-click normal pod', () => {
    expect(selectedPodExportValue(pod('normal'), true)).toEqual([]);
  });

  it('returns [] for a left-click pod with no status (treated as normal)', () => {
    expect(selectedPodExportValue(pod(undefined), true)).toEqual([]);
  });

  it('returns [] for a non-pod even when critical', () => {
    expect(selectedPodExportValue({ kind: 'service', status: 'critical', label: 'svc' }, true)).toEqual([]);
    expect(selectedPodExportValue({ kind: 'node', status: 'critical', label: 'ip-10' }, true)).toEqual([]);
  });

  it('returns [] for a right-click (isLeftClick false) even on a critical pod', () => {
    expect(selectedPodExportValue(pod('critical'), false)).toEqual([]);
  });

  it('returns [] for no selection', () => {
    expect(selectedPodExportValue(null, true)).toEqual([]);
  });
});
