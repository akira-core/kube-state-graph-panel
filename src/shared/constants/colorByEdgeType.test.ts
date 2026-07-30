import {
  EDGE_STYLE_BY_TYPE,
  EDGE_ENDPOINTS_BY_TYPE,
  EDGE_IS_TRAFFIC_BY_TYPE,
  isTrafficEdgeType,
} from './colorByEdgeType';
import { STATUS_COLOR } from './colorByStatus';

describe('colorByEdgeType', () => {
  it('keeps every edge colour clear of the reserved status colours (edge colour ≠ status colour)', () => {
    const statusColors = new Set(Object.values(STATUS_COLOR).map((c) => c.toLowerCase()));
    for (const [type, style] of Object.entries(EDGE_STYLE_BY_TYPE)) {
      expect(`${type}:${statusColors.has(style.color.toLowerCase())}`).toBe(`${type}:false`);
    }
  });

  it('gives the service edge pair a single non-green colour (no clash with status-normal green)', () => {
    expect(EDGE_STYLE_BY_TYPE['service-selects-pod'].color).toBe(EDGE_STYLE_BY_TYPE['pod-calls-service'].color);
    expect(EDGE_STYLE_BY_TYPE['service-selects-pod'].color.toLowerCase()).not.toBe(STATUS_COLOR.normal.toLowerCase());
  });

  it('defines a style + endpoints for pod-to-node (blue pod→node)', () => {
    expect(EDGE_STYLE_BY_TYPE['pod-to-node'].color).toBe('#3b82f6');
    expect(EDGE_ENDPOINTS_BY_TYPE['pod-to-node']).toEqual({ from: 'pod', to: 'node' });
  });

  it('defines a style + endpoints for pvc-to-storageclass (violet pvc→storageclass)', () => {
    expect(EDGE_STYLE_BY_TYPE['pvc-to-storageclass'].color).toBe('#8b5cf6');
    expect(EDGE_ENDPOINTS_BY_TYPE['pvc-to-storageclass']).toEqual({ from: 'pvc', to: 'storageclass' });
  });

  it('keeps the two storage edges distinguishable (pvc-to-storageclass ≠ pod-mounts-pvc)', () => {
    expect(EDGE_STYLE_BY_TYPE['pvc-to-storageclass'].color.toLowerCase()).not.toBe(
      EDGE_STYLE_BY_TYPE['pod-mounts-pvc'].color.toLowerCase()
    );
  });

  it('no longer carries the retired panel-synthetic edge types', () => {
    expect('pod-runs-on-node' in EDGE_STYLE_BY_TYPE).toBe(false);
    expect('controller-owns-pod' in EDGE_STYLE_BY_TYPE).toBe(false);
  });

  it('renders node-to-switch identically to switch-to-switch (shared infra colour + taxi routing)', () => {
    expect(EDGE_STYLE_BY_TYPE['node-to-switch'].color).toBe(EDGE_STYLE_BY_TYPE['switch-to-switch'].color);
    expect(EDGE_STYLE_BY_TYPE['node-to-switch'].lineStyle).toBe('solid');
    expect(EDGE_STYLE_BY_TYPE['node-to-switch'].routing).toBe('taxi');
    expect(EDGE_STYLE_BY_TYPE['switch-to-switch'].routing).toBe('taxi');
  });

  it('routes every non-fabric edge type as bezier', () => {
    for (const [type, style] of Object.entries(EDGE_STYLE_BY_TYPE)) {
      if (type !== 'switch-to-switch' && type !== 'node-to-switch') {
        expect(`${type}:${style.routing}`).toBe(`${type}:bezier`);
      }
    }
  });

  it('classifies only the request-carrying edge types as traffic', () => {
    const traffic = Object.entries(EDGE_IS_TRAFFIC_BY_TYPE)
      .filter(([, isTraffic]) => isTraffic)
      .map(([type]) => type)
      .sort();
    expect(traffic).toEqual(['pod-calls-pod', 'pod-calls-service', 'service-selects-pod']);
  });

  it('covers every styled edge type in the traffic map (no silent default for a new type)', () => {
    expect(Object.keys(EDGE_IS_TRAFFIC_BY_TYPE).sort()).toEqual(Object.keys(EDGE_STYLE_BY_TYPE).sort());
  });

  it('reports an unmapped or missing edge type as non-traffic', () => {
    expect(isTrafficEdgeType('pod-calls-service')).toBe(true);
    expect(isTrafficEdgeType('pod-mounts-pvc')).toBe(false);
    expect(isTrafficEdgeType('pod-calls-configmap')).toBe(false);
    expect(isTrafficEdgeType(undefined)).toBe(false);
  });

  it('includes the backend edges + switch fabric edges as known wire types', () => {
    expect('pod-to-node' in EDGE_STYLE_BY_TYPE).toBe(true);
    expect('pvc-to-storageclass' in EDGE_STYLE_BY_TYPE).toBe(true);
    expect('switch-to-switch' in EDGE_STYLE_BY_TYPE).toBe(true);
    expect('node-to-switch' in EDGE_STYLE_BY_TYPE).toBe(true);
  });
});
