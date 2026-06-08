import type cytoscape from 'cytoscape';

import { readNodeFabricTier } from './readNodeFabricTier';
import { readSwitchLevels } from './readSwitchLevels';

function sw(id: string, level: string): cytoscape.ElementDefinition {
  return { group: 'nodes', data: { id, kind: 'switch', labels: { level } } };
}
function nodeEl(id: string): cytoscape.ElementDefinition {
  return { group: 'nodes', data: { id, kind: 'node' } };
}
function n2s(node: string, swId: string): cytoscape.ElementDefinition {
  return { group: 'edges', data: { id: `e:${node}:${swId}`, source: node, target: swId, edgeType: 'node-to-switch' } };
}

describe('readNodeFabricTier', () => {
  it('controller mode: fabric-connected nodes pinned to min(level)-1', () => {
    const els = [sw('s0', '0'), sw('s1', '1'), nodeEl('n1'), n2s('n1', 's1')];
    const merged = readNodeFabricTier(els, 'controller', readSwitchLevels(els));
    expect(merged.get('n1')).toBe(-1);
    expect(merged.get('s0')).toBe(0);
  });
  it('node mode: no node pinned', () => {
    const els = [sw('s0', '0'), nodeEl('n1'), n2s('n1', 's0')];
    expect(readNodeFabricTier(els, 'node', readSwitchLevels(els)).has('n1')).toBe(false);
  });
  it('node with no node-to-switch edge is not pinned', () => {
    const els = [sw('s0', '0'), nodeEl('n1')];
    expect(readNodeFabricTier(els, 'controller', readSwitchLevels(els)).has('n1')).toBe(false);
  });
  it('no levelled switch: returns the (empty) switch map, no node tier', () => {
    const els = [nodeEl('n1')];
    expect(readNodeFabricTier(els, 'controller', readSwitchLevels(els)).size).toBe(0);
  });
  it('controller mode with group-less elements: node still pins to min(level)-1 when group field is omitted', () => {
    // Elements defined without a `group` field — only `data` present.
    // readNodeFabricTier must infer node/edge from data shape alone (no .group).
    const els: cytoscape.ElementDefinition[] = [
      { data: { id: 's0', kind: 'switch', labels: { level: '0' } } },
      { data: { id: 'n1', kind: 'node' } },
      { data: { id: 'e1', source: 'n1', target: 's0', edgeType: 'node-to-switch' } },
    ];
    const levels = readSwitchLevels(els);
    const merged = readNodeFabricTier(els, 'controller', levels);
    // min(switch level) is 0, so node tier is 0 - 1 = -1.
    expect(merged.get('n1')).toBe(-1);
    expect(merged.get('s0')).toBe(0);
  });
});
