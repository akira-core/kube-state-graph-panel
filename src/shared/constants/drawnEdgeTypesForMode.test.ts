import { drawnEdgeTypesForMode } from './drawnEdgeTypesForMode';

describe('drawnEdgeTypesForMode', () => {
  it('draws neither controller-owns-pod nor pod-runs-on-node in node mode; switch fabric in both modes', () => {
    const drawn = drawnEdgeTypesForMode('node');
    expect(drawn).toEqual(
      expect.arrayContaining([
        'pod-mounts-pvc',
        'pod-calls-pod',
        'pod-calls-service',
        'service-selects-pod',
        'switch-to-switch',
        'node-to-switch',
      ])
    );
    expect(drawn).toHaveLength(6);
    expect(drawn).not.toContain('pod-runs-on-node');
    // controller-owns-pod is filtered out of node mode entirely, so it is never drawn there.
    expect(drawn).not.toContain('controller-owns-pod');
  });

  it('draws pod-runs-on-node (not controller-owns-pod) in controller mode; switch fabric still drawn', () => {
    const drawn = drawnEdgeTypesForMode('controller');
    expect(drawn).toEqual(
      expect.arrayContaining([
        'pod-mounts-pvc',
        'pod-calls-pod',
        'pod-calls-service',
        'service-selects-pod',
        'pod-runs-on-node',
        'switch-to-switch',
        'node-to-switch',
      ])
    );
    expect(drawn).toHaveLength(7);
    expect(drawn).not.toContain('controller-owns-pod');
  });

  it('draws the physical switch fabric (switch-to-switch, node-to-switch) regardless of pod-parent mode', () => {
    for (const mode of ['node', 'controller'] as const) {
      expect(drawnEdgeTypesForMode(mode)).toEqual(expect.arrayContaining(['switch-to-switch', 'node-to-switch']));
    }
  });

  it('returns a fresh array each call (no shared mutable state)', () => {
    const first = drawnEdgeTypesForMode('node');
    first.push('pod-runs-on-node');
    expect(drawnEdgeTypesForMode('node')).not.toContain('pod-runs-on-node');
    expect(drawnEdgeTypesForMode('node')).toHaveLength(6);
  });
});
