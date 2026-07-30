import cytoscape from 'cytoscape';

import { FADED_CLASS } from '../styles/getStylesheet';

import { applySelectionFocus } from './useSelectionFocus';

// cluster > node > pod, with a pvc neighbour of the pod and a far-away node.
function makeCy(): cytoscape.Core {
  return cytoscape({
    headless: true,
    elements: [
      { group: 'nodes', data: { id: 'cluster/prod', isCluster: true } },
      { group: 'nodes', data: { id: 'node/w0', kind: 'node', parent: 'cluster/prod' } },
      { group: 'nodes', data: { id: 'pod/a', kind: 'pod', parent: 'node/w0' } },
      { group: 'nodes', data: { id: 'pvc/a', kind: 'pvc', parent: 'cluster/prod' } },
      { group: 'nodes', data: { id: 'sw/x', kind: 'switch' } },
      { group: 'edges', data: { id: 'e-mount', source: 'pod/a', target: 'pvc/a', edgeType: 'pod-mounts-pvc' } },
      { group: 'edges', data: { id: 'e-far', source: 'node/w0', target: 'sw/x', edgeType: 'node-to-switch' } },
    ],
  });
}

const faded = (cy: cytoscape.Core): string[] =>
  cy
    .elements(`.${FADED_CLASS}`)
    .map((e) => e.id())
    .sort();

describe('applySelectionFocus', () => {
  it('fades nothing when selection is null', () => {
    const cy = makeCy();
    applySelectionFocus(cy, 'pod/a');
    applySelectionFocus(cy, null);
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });

  it('keeps the selected node, its edge, neighbour and ancestors lit; fades the rest', () => {
    const cy = makeCy();
    applySelectionFocus(cy, 'pod/a');
    // pod/a (selected), pvc/a (neighbour), e-mount (incident edge), node/w0 +
    // cluster/prod (ancestors) stay lit. The far switch + its edge fade.
    expect(faded(cy)).toEqual(['e-far', 'sw/x']);
    cy.destroy();
  });

  it('keeps a selected container’s children lit', () => {
    const cy = makeCy();
    applySelectionFocus(cy, 'node/w0');
    // node/w0 selected: its child pod/a stays lit (descendant); the unrelated pvc
    // and… pvc/a is a sibling under the cluster (ancestor of w0), so cluster is lit
    // but pvc/a is neither neighbour nor descendant → faded.
    expect(faded(cy)).toContain('pvc/a');
    expect(faded(cy)).not.toContain('pod/a');
    cy.destroy();
  });

  it('clears stale fades on re-apply', () => {
    const cy = makeCy();
    applySelectionFocus(cy, 'sw/x');
    applySelectionFocus(cy, 'pod/a');
    // sw/x is now outside pod/a's focus, so it must be faded; pod/a must not be.
    expect(faded(cy)).toContain('sw/x');
    expect(faded(cy)).not.toContain('pod/a');
    cy.destroy();
  });

  it('fades nothing when the selected node is hidden by the filter', () => {
    // styleEnabled so visibility styles (and .visible()) are live, as in production.
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { group: 'nodes', data: { id: 'pod/igw', kind: 'pod' } },
        { group: 'nodes', data: { id: 'pod/a', kind: 'pod' } },
        { group: 'nodes', data: { id: 'pod/b', kind: 'pod' } },
        { group: 'edges', data: { id: 'e-ab', source: 'pod/a', target: 'pod/b', edgeType: 'pod-calls-pod' } },
      ],
    });
    // The ingress toggle (or a kind/edge-type filter) hides the SELECTED node.
    cy.getElementById('pod/igw').style('visibility', 'hidden');
    applySelectionFocus(cy, 'pod/igw');
    // Nothing may fade: dimming around an invisible node leaves the whole graph at
    // reduced opacity with nothing lit to explain why.
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });

  it('fades nothing when the selected node is hidden via a filtered-out ancestor', () => {
    // cytoscape's effective visibility is the AND over ancestors, so a node whose
    // container was filtered out is off-canvas despite its own style being 'visible'.
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { group: 'nodes', data: { id: 'ctrl/igw' } },
        { group: 'nodes', data: { id: 'pod/igw', kind: 'pod', parent: 'ctrl/igw' } },
        { group: 'nodes', data: { id: 'pod/a', kind: 'pod' } },
        { group: 'nodes', data: { id: 'pod/b', kind: 'pod' } },
        { group: 'edges', data: { id: 'e-ab', source: 'pod/a', target: 'pod/b', edgeType: 'pod-calls-pod' } },
      ],
    });
    cy.getElementById('ctrl/igw').style('visibility', 'hidden');
    expect(cy.getElementById('pod/igw').style('visibility')).toBe('visible'); // own style only
    applySelectionFocus(cy, 'pod/igw');
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });
});
