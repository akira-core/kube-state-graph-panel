import cytoscape from 'cytoscape';

import { FADED_CLASS } from '../styles/getStylesheet';

import { applyGraphFade, type GraphFadeInput } from './useGraphFade';

// cluster > node > pod, with a pvc neighbour of the pod and a far-away switch.
// styleEnabled so visibility styles (and `.visible()`) are live, as in production —
// cytoscape short-circuits `.visible()` to true when styling is off.
function makeCy(): cytoscape.Core {
  return cytoscape({
    headless: true,
    styleEnabled: true,
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

const NO_HITS: ReadonlySet<string> = new Set();

// Idle input: nothing selected, no query. Tests override only what they exercise.
const fade = (cy: cytoscape.Core, over: Partial<GraphFadeInput> = {}): void =>
  applyGraphFade(cy, {
    selectedId: null,
    searchActive: false,
    searchLitNodeIds: NO_HITS,
    searchFocusNodeId: null,
    ...over,
  });

const faded = (cy: cytoscape.Core): string[] =>
  cy
    .elements(`.${FADED_CLASS}`)
    .map((e) => e.id())
    .sort();

const allIds = (cy: cytoscape.Core): string[] =>
  cy
    .elements()
    .map((e) => e.id())
    .sort();

describe('applyGraphFade — focus fade (no query)', () => {
  it('fades nothing when the selection is null', () => {
    const cy = makeCy();
    fade(cy, { selectedId: 'pod/a' });
    fade(cy, { selectedId: null });
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });

  it('keeps the selected node, its edge, neighbour and ancestors lit; fades the rest', () => {
    const cy = makeCy();
    fade(cy, { selectedId: 'pod/a' });
    // pod/a (selected), pvc/a (neighbour), e-mount (incident edge), node/w0 +
    // cluster/prod (ancestors) stay lit. The far switch + its edge fade.
    expect(faded(cy)).toEqual(['e-far', 'sw/x']);
    cy.destroy();
  });

  it('keeps a selected container’s children lit', () => {
    const cy = makeCy();
    fade(cy, { selectedId: 'node/w0' });
    // node/w0 selected: its child pod/a stays lit (descendant). pvc/a is a sibling under
    // the cluster (an ancestor of w0), so the cluster is lit but pvc/a is neither
    // neighbour nor descendant → faded.
    expect(faded(cy)).toContain('pvc/a');
    expect(faded(cy)).not.toContain('pod/a');
    cy.destroy();
  });

  it('clears stale fades on re-apply', () => {
    const cy = makeCy();
    fade(cy, { selectedId: 'sw/x' });
    fade(cy, { selectedId: 'pod/a' });
    // sw/x is now outside pod/a's focus, so it must be faded; pod/a must not be.
    expect(faded(cy)).toContain('sw/x');
    expect(faded(cy)).not.toContain('pod/a');
    cy.destroy();
  });

  it('fades nothing when the selected node is hidden by the filter', () => {
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
    fade(cy, { selectedId: 'pod/igw' });
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
    fade(cy, { selectedId: 'pod/igw' });
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });
});

describe('applyGraphFade — miss fade (query active)', () => {
  it('ignores the hit set entirely while the query is empty', () => {
    const cy = makeCy();
    fade(cy, { searchActive: false, searchLitNodeIds: new Set(['pod/a']) });
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });

  it('keeps a hit, its incident edges and its ancestors lit; fades the rest INCLUDING a non-hit neighbour', () => {
    const cy = makeCy();
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['pod/a']) });
    // pod/a (hit) + e-mount (its incident edge) stay lit; node/w0 + cluster/prod are
    // ancestors (a lit node must never sit inside a faded box). Unlike focus fade, miss
    // fade pulls in no neighbour NODE: pvc/a is not itself a hit, so it fades even though
    // its edge to pod/a stays lit.
    expect(faded(cy)).toEqual(['e-far', 'pvc/a', 'sw/x']);
    cy.destroy();
  });

  it('lights a PROXY container directly (no incident-edge/ancestor walk needed for the container itself)', () => {
    const cy = makeCy();
    // node/w0 stands in as the proxy for a collapsed pod — its own ancestor (cluster)
    // stays lit too.
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['node/w0']) });
    expect(faded(cy)).not.toContain('node/w0');
    expect(faded(cy)).not.toContain('cluster/prod');
    expect(faded(cy)).toContain('sw/x');
    cy.destroy();
  });

  it('fades EVERYTHING on a zero-hit query', () => {
    const cy = makeCy();
    fade(cy, { searchActive: true });
    expect(faded(cy)).toEqual(allIds(cy));
    cy.destroy();
  });

  it('fades EVERYTHING on a zero-hit query even when a node is selected', () => {
    const cy = makeCy();
    // "No results" must read as no results — a live selection may not leave a lit island.
    fade(cy, { searchActive: true, selectedId: 'pod/a' });
    expect(faded(cy)).toEqual(allIds(cy));
    cy.destroy();
  });

  it('fades EVERYTHING on a zero-hit query even when a node was located earlier', () => {
    const cy = makeCy();
    fade(cy, { searchActive: true, searchFocusNodeId: 'pod/a' });
    expect(faded(cy)).toEqual(allIds(cy));
    cy.destroy();
  });

  it('a selection carried in from before the query does NOT light its neighborhood', () => {
    const cy = makeCy();
    // pod/a was selected before the user typed; the detail panel's × leaves the selection
    // set. Only sw/x matches, so pod/a and its neighbours must read as misses.
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['sw/x']), selectedId: 'pod/a' });
    expect(faded(cy)).toEqual(['cluster/prod', 'e-mount', 'node/w0', 'pod/a', 'pvc/a']);
    cy.destroy();
  });

  it('a LOCATED node lights its closed neighborhood (1-hop), matching canvas-click focus', () => {
    const cy = makeCy();
    // Locate commits the node's label as the query, so it is a hit as well as the focus.
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['pod/a']), searchFocusNodeId: 'pod/a' });
    // pvc/a (neighbour) now stays lit; only the far switch + its edge fade.
    expect(faded(cy)).toEqual(['e-far', 'sw/x']);
    cy.destroy();
  });

  it('a located node hidden by the filter does not expand the lit set', () => {
    const cy = makeCy();
    cy.getElementById('pod/a').style('visibility', 'hidden');
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['sw/x']), searchFocusNodeId: 'pod/a' });
    // Same result as no focus at all: only sw/x and its edge stay lit.
    expect(faded(cy)).toEqual(['cluster/prod', 'e-mount', 'node/w0', 'pod/a', 'pvc/a']);
    cy.destroy();
  });

  it('clears stale fades on re-apply while the query is active', () => {
    const cy = makeCy();
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['sw/x']) });
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['pod/a']) });
    expect(faded(cy)).toContain('sw/x');
    expect(faded(cy)).not.toContain('pod/a');
    cy.destroy();
  });

  it('clearing the query restores the focus fade for the standing selection', () => {
    const cy = makeCy();
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['sw/x']), selectedId: 'pod/a' });
    expect(faded(cy)).toContain('pod/a');
    fade(cy, { selectedId: 'pod/a' });
    // Focus fade is back: pod/a's neighborhood is lit, the far switch fades.
    expect(faded(cy)).toEqual(['e-far', 'sw/x']);
    cy.destroy();
  });
});
