import { drawnEdgeTypesForMode } from './drawnEdgeTypesForMode';

describe('drawnEdgeTypesForMode', () => {
  it('draws pod-runs-on-node as nesting in node mode (service-selects-pod is the drawn pod↔service edge); switch fabric is drawn in both modes', () => {
    expect(drawnEdgeTypesForMode('node')).toEqual([
      'pod-mounts-pvc',
      'pod-calls-pod',
      'pod-calls-service',
      'service-selects-pod',
      'switch-to-switch',
      'node-to-switch',
    ]);
  });

  it('draws pod-runs-on-node and drops service-selects-pod in service mode; switch fabric still drawn', () => {
    expect(drawnEdgeTypesForMode('service')).toEqual([
      'pod-mounts-pvc',
      'pod-calls-pod',
      'pod-calls-service',
      'pod-runs-on-node',
      'switch-to-switch',
      'node-to-switch',
    ]);
  });

  it('draws the physical switch fabric (switch-to-switch, node-to-switch) regardless of pod-parent mode', () => {
    for (const mode of ['node', 'service'] as const) {
      expect(drawnEdgeTypesForMode(mode)).toEqual(expect.arrayContaining(['switch-to-switch', 'node-to-switch']));
    }
  });

  it('returns a fresh array each call (no shared mutable state)', () => {
    const first = drawnEdgeTypesForMode('node');
    first.push('pod-runs-on-node');
    expect(drawnEdgeTypesForMode('node')).toEqual([
      'pod-mounts-pvc',
      'pod-calls-pod',
      'pod-calls-service',
      'service-selects-pod',
      'switch-to-switch',
      'node-to-switch',
    ]);
  });
});
