import type cytoscape from 'cytoscape';

import { computeVisibility } from './computeVisibility';

const node = (id: string, kind: string): cytoscape.ElementDefinition =>
  ({ group: 'nodes', data: { id, kind } }) as unknown as cytoscape.ElementDefinition;
const edge = (id: string, source: string, target: string, edgeType: string): cytoscape.ElementDefinition =>
  ({ group: 'edges', data: { id, source, target, edgeType } }) as unknown as cytoscape.ElementDefinition;

describe('computeVisibility', () => {
  it('marks everything visible when all kinds + edgeTypes are enabled', () => {
    const elements = [node('a', 'pod'), node('b', 'service'), edge('e', 'a', 'b', 'service-selects-pod')];
    const { visibleNodeIds, visibleEdgeIds } = computeVisibility(elements, ['pod', 'service'], ['service-selects-pod']);
    expect([...visibleNodeIds]).toEqual(['a', 'b']);
    expect([...visibleEdgeIds]).toEqual(['e']);
  });

  it('hides nodes whose kind is filtered out', () => {
    const elements = [node('a', 'pod'), node('b', 'service')];
    const { visibleNodeIds } = computeVisibility(elements, ['service'], []);
    expect([...visibleNodeIds]).toEqual(['b']);
  });

  it('hides edges whose edgeType is filtered out', () => {
    const elements = [node('a', 'pod'), node('b', 'service'), edge('e', 'a', 'b', 'service-selects-pod')];
    const { visibleEdgeIds } = computeVisibility(elements, ['pod', 'service'], []);
    expect([...visibleEdgeIds]).toEqual([]);
  });

  it('auto-hides edges when an endpoint becomes hidden', () => {
    const elements = [node('a', 'pod'), node('b', 'service'), edge('e', 'a', 'b', 'service-selects-pod')];
    const { visibleEdgeIds } = computeVisibility(elements, ['pod'], ['service-selects-pod']);
    expect([...visibleEdgeIds]).toEqual([]);
  });

  it('returns empty sets for empty elements', () => {
    const { visibleNodeIds, visibleEdgeIds } = computeVisibility([], ['pod'], ['service-selects-pod']);
    expect(visibleNodeIds.size).toBe(0);
    expect(visibleEdgeIds.size).toBe(0);
  });

  it('keeps unknown kinds visible by default', () => {
    const elements = [node('cr', 'CustomResource')];
    const { visibleNodeIds } = computeVisibility(elements, [], []);
    expect([...visibleNodeIds]).toEqual(['cr']);
  });
});
