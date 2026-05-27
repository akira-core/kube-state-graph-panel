import type cytoscape from 'cytoscape';

import { diffElements } from './diffElements';

const node = (id: string, extra: Record<string, unknown> = {}): cytoscape.ElementDefinition => ({
  group: 'nodes',
  data: { id, ...extra },
});

const edge = (
  id: string,
  source: string,
  target: string,
  extra: Record<string, unknown> = {},
): cytoscape.ElementDefinition => ({
  group: 'edges',
  data: { id, source, target, ...extra },
});

describe('diffElements', () => {
  it('returns empty diff for identical sets', () => {
    const current = [node('a'), node('b'), edge('a-b', 'a', 'b')];
    const next = [node('a'), node('b'), edge('a-b', 'a', 'b')];
    expect(diffElements(current, next)).toEqual({ toAdd: [], toRemove: [], toUpdate: [] });
  });

  it('detects additions', () => {
    const current = [node('a')];
    const next = [node('a'), node('b')];
    const diff = diffElements(current, next);
    expect(diff.toAdd).toHaveLength(1);
    expect(diff.toAdd[0]?.data.id).toBe('b');
    expect(diff.toRemove).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it('detects removals', () => {
    const current = [node('a'), node('b')];
    const next = [node('a')];
    expect(diffElements(current, next).toRemove).toEqual(['b']);
  });

  it('detects updates when data fields differ', () => {
    const current = [node('a', { label: 'one' })];
    const next = [node('a', { label: 'two' })];
    const diff = diffElements(current, next);
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0]?.data.label).toBe('two');
  });

  it('detects updates for nested labels object', () => {
    const current = [node('a', { labels: { app: 'foo' } })];
    const next = [node('a', { labels: { app: 'bar' } })];
    expect(diffElements(current, next).toUpdate).toHaveLength(1);
  });

  it('handles empty input on both sides', () => {
    expect(diffElements([], [])).toEqual({ toAdd: [], toRemove: [], toUpdate: [] });
  });

  it('ignores elements without an id', () => {
    const noId: cytoscape.ElementDefinition = { group: 'nodes', data: {} };
    const diff = diffElements([noId], [noId, node('a')]);
    expect(diff.toAdd).toHaveLength(1);
    expect(diff.toAdd[0]?.data.id).toBe('a');
    expect(diff.toRemove).toEqual([]);
  });
});
