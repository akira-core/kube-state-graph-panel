import { createTheme } from '@grafana/data';
import cytoscape from 'cytoscape';

import { COLOR_BY_EDGE_TYPE, FALLBACK_EDGE_STYLE } from '../../../shared/constants/colorByEdgeType';
import { FALLBACK_SHAPE, SHAPE_BY_KIND } from '../../../shared/constants/shapeByKind';

import { getStylesheet } from './getStylesheet';

type FakeData = Record<string, unknown>;
type StyleRecord = Record<string, unknown>;
type ShapeFn = (ele: cytoscape.NodeSingular) => string;
type EdgeFn = (ele: cytoscape.EdgeSingular) => string;

// The shape / line-color / line-style props are function-valued mappers cytoscape
// evaluates per element. Build a minimal element exposing `.data(key)` so we can
// invoke them directly without a live cytoscape instance.
const fakeEle = (data: FakeData): cytoscape.NodeSingular & cytoscape.EdgeSingular =>
  ({ data: (k: string) => data[k] }) as unknown as cytoscape.NodeSingular & cytoscape.EdgeSingular;

// `.style` lives on a StylesheetStyle | StylesheetCSS union (the CSS variant has
// no `style`); widen to a plain record so we can pull the function-valued mapper
// props back out as callables.
const styleFor = (selector: string): StyleRecord => {
  const sheet = getStylesheet({ theme: createTheme() }) as unknown as Array<{
    selector: string;
    style?: StyleRecord;
  }>;
  return sheet.find((s) => s.selector === selector)?.style ?? {};
};

describe('getStylesheet', () => {
  it('returns the expected number of selectors', () => {
    const sheet = getStylesheet({ theme: createTheme() });
    const selectors = sheet.map((s) => s.selector);
    expect(selectors).toEqual(expect.arrayContaining(['node', 'node:selected', 'edge']));
  });

  it('produces different colors for light vs dark theme', () => {
    const light = getStylesheet({ theme: createTheme({ colors: { mode: 'light' } }) });
    const dark = getStylesheet({ theme: createTheme({ colors: { mode: 'dark' } }) });
    expect(JSON.stringify(light)).not.toBe(JSON.stringify(dark));
  });

  it('matches snapshot for default theme', () => {
    const sheet = getStylesheet({ theme: createTheme() });
    expect(sheet).toMatchSnapshot();
  });

  it('maps every backend node kind to its SHAPE_BY_KIND shape', () => {
    const shapeFn = styleFor('node').shape as ShapeFn;
    for (const [kind, shape] of Object.entries(SHAPE_BY_KIND)) {
      expect(shapeFn(fakeEle({ kind }))).toBe(shape);
    }
  });

  it('uses the reconfigured kind shapes (service=hexagon, node=round-rectangle, pvc=pentagon)', () => {
    const shapeFn = styleFor('node').shape as ShapeFn;
    expect(shapeFn(fakeEle({ kind: 'service' }))).toBe('hexagon');
    expect(shapeFn(fakeEle({ kind: 'node' }))).toBe('round-rectangle');
    expect(shapeFn(fakeEle({ kind: 'pvc' }))).toBe('pentagon');
    expect(shapeFn(fakeEle({ kind: 'pod' }))).toBe('ellipse');
  });

  it('maps every backend edge type to its color and line style', () => {
    const edgeStyle = styleFor('edge');
    const colorFn = edgeStyle['line-color'] as EdgeFn;
    const lineFn = edgeStyle['line-style'] as EdgeFn;
    for (const [edgeType, style] of Object.entries(COLOR_BY_EDGE_TYPE)) {
      expect(colorFn(fakeEle({ edgeType }))).toBe(style.color);
      expect(lineFn(fakeEle({ edgeType }))).toBe(style.lineStyle);
    }
  });

  it('falls back for unknown/undefined kind & edge type', () => {
    const shapeFn = styleFor('node').shape as ShapeFn;
    const colorFn = styleFor('edge')['line-color'] as EdgeFn;
    expect(shapeFn(fakeEle({ kind: 'mystery' }))).toBe(FALLBACK_SHAPE);
    expect(shapeFn(fakeEle({}))).toBe(FALLBACK_SHAPE);
    expect(colorFn(fakeEle({ edgeType: 'nope' }))).toBe(FALLBACK_EDGE_STYLE.color);
  });

  it('enlarges base leaf node to 40x40', () => {
    const nodeStyle = styleFor('node');
    expect(nodeStyle.width).toBe(40);
    expect(nodeStyle.height).toBe(40);
  });

  it('declares collapsed-node and meta-edge selectors with collapsed-cluster events override after node[?isCluster]', () => {
    const sheet = getStylesheet({ theme: createTheme() }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const selectors = sheet.map((s) => s.selector);
    expect(selectors).toContain('node.cy-expand-collapse-collapsed-node');
    expect(selectors).toContain('node[?isCluster].cy-expand-collapse-collapsed-node');
    expect(selectors).toContain('edge.cy-expand-collapse-meta-edge');
    // collapsed-cluster events:'yes' override must come AFTER the decorative
    // node[?isCluster] (events:'no') so it wins the cascade.
    expect(selectors.indexOf('node[?isCluster].cy-expand-collapse-collapsed-node')).toBeGreaterThan(
      selectors.indexOf('node[?isCluster]')
    );
    const collapsedCluster = sheet.find((s) => s.selector === 'node[?isCluster].cy-expand-collapse-collapsed-node');
    expect(collapsedCluster?.style?.events).toBe('yes');
    const metaEdge = sheet.find((s) => s.selector === 'edge.cy-expand-collapse-meta-edge');
    expect(metaEdge?.style?.['line-color']).toBe('#94a3b8');
  });

  it('styles compound parents as boxes and leaves by kind (headless :parent)', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: createTheme() }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'cluster:demo', label: 'demo', isCluster: true, clusterColor: '#14b8a6' } },
        { group: 'nodes', data: { id: 'demo/node-a', label: 'node-a', kind: 'node', parent: 'cluster:demo' } },
        { group: 'nodes', data: { id: 'demo/p1', label: 'web', kind: 'pod', parent: 'demo/node-a' } },
        { group: 'nodes', data: { id: 'leaf-node', label: 'solo', kind: 'node' } },
      ],
    });
    // A node that contains pods is a compound parent → container box.
    expect(cy.getElementById('demo/node-a').style('shape')).toBe('round-rectangle');
    // A leaf pod keeps its kind shape.
    expect(cy.getElementById('demo/p1').style('shape')).toBe('ellipse');
    // A childless node falls through to its kind shape (round-rectangle), not a box.
    expect(cy.getElementById('leaf-node').style('shape')).toBe('round-rectangle');
    // The cluster container gets the translucent backplate opacity (not the
    // generic node:parent 0.05), proving node[?isCluster] wins the cascade.
    expect(Number(cy.getElementById('cluster:demo').style('background-opacity'))).toBeCloseTo(0.07);
    cy.destroy();
  });
});
