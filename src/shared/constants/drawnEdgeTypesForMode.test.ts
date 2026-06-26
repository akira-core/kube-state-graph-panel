import { drawnEdgeTypesForMode } from './drawnEdgeTypesForMode';

describe('drawnEdgeTypesForMode', () => {
  it('does not draw pod-to-node in node mode; service/storage + switch fabric still drawn', () => {
    const drawn = drawnEdgeTypesForMode('node');
    expect(drawn).toEqual(
      expect.arrayContaining([
        'pod-mounts-pvc',
        'pod-calls-pod',
        'pod-calls-service',
        'service-selects-pod',
        'pvc-to-storageclass',
        'switch-to-switch',
        'node-to-switch',
      ])
    );
    expect(drawn).toHaveLength(7);
    // pod-to-node is expressed as nesting in node mode, so it is never drawn there.
    expect(drawn).not.toContain('pod-to-node');
  });

  it('draws pod-to-node in controller mode; service/storage + switch fabric still drawn', () => {
    const drawn = drawnEdgeTypesForMode('controller');
    expect(drawn).toEqual(
      expect.arrayContaining([
        'pod-mounts-pvc',
        'pod-calls-pod',
        'pod-calls-service',
        'service-selects-pod',
        'pod-to-node',
        'pvc-to-storageclass',
        'switch-to-switch',
        'node-to-switch',
      ])
    );
    expect(drawn).toHaveLength(8);
  });

  it('draws the physical switch fabric (switch-to-switch, node-to-switch) regardless of pod-parent mode', () => {
    for (const mode of ['node', 'controller'] as const) {
      expect(drawnEdgeTypesForMode(mode)).toEqual(expect.arrayContaining(['switch-to-switch', 'node-to-switch']));
    }
  });

  it('draws pvc-to-storageclass in both modes', () => {
    expect(drawnEdgeTypesForMode('node')).toContain('pvc-to-storageclass');
    expect(drawnEdgeTypesForMode('controller')).toContain('pvc-to-storageclass');
  });

  it('returns a fresh array each call (no shared mutable state)', () => {
    const first = drawnEdgeTypesForMode('node');
    first.push('pod-to-node');
    expect(drawnEdgeTypesForMode('node')).not.toContain('pod-to-node');
    expect(drawnEdgeTypesForMode('node')).toHaveLength(7);
  });
});
