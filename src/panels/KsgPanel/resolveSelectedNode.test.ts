import type cytoscape from 'cytoscape';

import { resolveSelectedNode } from './KsgPanel';

type El = cytoscape.ElementDefinition;
const node = (id: string, kind: string, extra: Record<string, unknown> = {}): El =>
  ({ group: 'nodes', data: { id, label: id, kind, ...extra } }) as unknown as El;

describe('resolveSelectedNode', () => {
  const elements = [
    node('p1', 'pod'),
    node('cl', 'node', { isCluster: true }),
    // StorageClass group: a grouping container that DOES carry a kind but is still
    // excluded from the detail panel via the isStorageClass flag (mirrors normalize).
    {
      group: 'nodes',
      data: { id: 'sc', label: 'fast-ssd', kind: 'storageclass', isStorageClass: true },
    } as unknown as El,
  ];

  it('returns the node detail when the selected node is visible', () => {
    const result = resolveSelectedNode(elements, 'p1', new Set(['p1']));
    expect(result).toEqual({ id: 'p1', label: 'p1', kind: 'pod' });
  });

  it('returns null when nothing is selected', () => {
    expect(resolveSelectedNode(elements, null, new Set(['p1']))).toBeNull();
  });

  it('returns null when the selected node is hidden (not in the visible set)', () => {
    // e.g. orphan cascade or kind filter hid the node after it was selected.
    expect(resolveSelectedNode(elements, 'p1', new Set())).toBeNull();
  });

  it('returns null for a cluster container even if visible', () => {
    expect(resolveSelectedNode(elements, 'cl', new Set(['cl']))).toBeNull();
  });

  it('returns null for a storageclass group container even if visible (pure grouping box, no detail)', () => {
    expect(resolveSelectedNode(elements, 'sc', new Set(['sc']))).toBeNull();
  });
});
