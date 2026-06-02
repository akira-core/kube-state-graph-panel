import { drawnEdgeTypesForMode } from './drawnEdgeTypesForMode';

describe('drawnEdgeTypesForMode', () => {
  it('draws pod-runs-on-node as nesting in node mode (service-selects-pod is the drawn pod↔service edge)', () => {
    expect(drawnEdgeTypesForMode('node')).toEqual(['pod-mounts-pvc', 'pod-calls-pod', 'service-selects-pod']);
  });

  it('draws pod-runs-on-node and drops service-selects-pod in service mode', () => {
    expect(drawnEdgeTypesForMode('service')).toEqual(['pod-mounts-pvc', 'pod-calls-pod', 'pod-runs-on-node']);
  });

  it('returns a fresh array each call (no shared mutable state)', () => {
    const first = drawnEdgeTypesForMode('node');
    first.push('pod-runs-on-node');
    expect(drawnEdgeTypesForMode('node')).toEqual(['pod-mounts-pvc', 'pod-calls-pod', 'service-selects-pod']);
  });
});
