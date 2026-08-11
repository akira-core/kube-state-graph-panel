import cytoscape from 'cytoscape';

import { SEARCH_FADE_CLASS } from '../styles/getStylesheet';

import { applySearchFade } from './useSearchFade';

// cluster > node > pod, with a pvc neighbour of the pod and a far-away switch.
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
    .elements(`.${SEARCH_FADE_CLASS}`)
    .map((e) => e.id())
    .sort();

describe('applySearchFade', () => {
  it('fades nothing when search is inactive, even with a non-empty lit set', () => {
    const cy = makeCy();
    applySearchFade(cy, new Set(['pod/a']), false);
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });

  it('keeps a lit node, its incident edges, and its ancestors lit; fades the rest (INCLUDING a non-hit neighbour)', () => {
    const cy = makeCy();
    applySearchFade(cy, new Set(['pod/a']), true);
    // pod/a (lit) + e-mount (its incident edge) stay lit; node/w0 + cluster/prod are
    // ancestors (must stay lit so a lit node never sits inside a faded box). Unlike
    // FOCUS fade (closedNeighborhood), miss fade does NOT pull in a non-hit neighbour —
    // pvc/a is not itself a hit, so it fades even though its edge to pod/a stays lit
    // (design: "hit nodes, their incident edges, their ancestor containers" — no
    // neighbour-node inclusion).
    expect(faded(cy)).toEqual(['e-far', 'pvc/a', 'sw/x']);
    cy.destroy();
  });

  it('lights a PROXY container directly (no incident-edge/ancestor walk needed for the container itself)', () => {
    const cy = makeCy();
    // node/w0 stands in as the proxy for a collapsed pod — its own ancestor (cluster)
    // stays lit too.
    applySearchFade(cy, new Set(['node/w0']), true);
    expect(faded(cy)).not.toContain('node/w0');
    expect(faded(cy)).not.toContain('cluster/prod');
    expect(faded(cy)).toContain('sw/x');
  });

  it('fades EVERYTHING when active with an empty lit set (zero hits)', () => {
    const cy = makeCy();
    applySearchFade(cy, new Set(), true);
    const allIds = cy
      .elements()
      .map((e) => e.id())
      .sort();
    expect(faded(cy)).toEqual(allIds);
    cy.destroy();
  });

  it('clears stale fades on re-apply', () => {
    const cy = makeCy();
    applySearchFade(cy, new Set(['sw/x']), true);
    applySearchFade(cy, new Set(['pod/a']), true);
    expect(faded(cy)).toContain('sw/x');
    expect(faded(cy)).not.toContain('pod/a');
    cy.destroy();
  });

  it('clears every fade when search goes inactive again', () => {
    const cy = makeCy();
    applySearchFade(cy, new Set(['pod/a']), true);
    applySearchFade(cy, new Set(), false);
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });
});
