import { createTheme } from '@grafana/data';
import type cytoscape from 'cytoscape';

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
});
