import { EDGE_STYLE_BY_TYPE, EDGE_ENDPOINTS_BY_TYPE } from './colorByEdgeType';
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

  it('defines a style + endpoints for controller-owns-pod', () => {
    expect(EDGE_STYLE_BY_TYPE['controller-owns-pod']).toBeDefined();
    expect(EDGE_ENDPOINTS_BY_TYPE['controller-owns-pod']).toEqual({ from: 'controller', to: 'pod' });
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

  it('includes controller-owns-pod and the switch fabric edges as known wire types', () => {
    expect('controller-owns-pod' in EDGE_STYLE_BY_TYPE).toBe(true);
    expect('switch-to-switch' in EDGE_STYLE_BY_TYPE).toBe(true);
    expect('node-to-switch' in EDGE_STYLE_BY_TYPE).toBe(true);
  });
});
