import { fireEvent, render, screen } from '@testing-library/react';
import cytoscape from 'cytoscape';
import React from 'react';

// A REAL headless cytoscape instance stands in for the one useCytoscape would
// build, so the cxttap/tap effects bind against genuine event plumbing. The refs
// are dereferenced lazily (inside the arrow bodies), keeping hoisting order safe.
const mockCyRef: { current: cytoscape.Core | null } = { current: null };
const mockContainerRef = React.createRef<HTMLDivElement>();

jest.mock('../../hooks/useCytoscape', () => ({
  useCytoscape: (): unknown => ({ containerRef: mockContainerRef, cyRef: mockCyRef, isReady: true }),
}));
// fcose/dagre are not registered in the jest env — layout is not under test here.
jest.mock('../../hooks/useGraphLayout', () => ({ useGraphLayout: (): void => undefined }));

import { GraphCanvas } from './GraphCanvas';

const elements: cytoscape.ElementDefinition[] = [
  { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0' } },
  // Cluster backplate: decorative, never selectable (mirrors normalize).
  { group: 'nodes', selectable: false, data: { id: 'cl', isCluster: true, label: 'demo' } },
  // Namespace group: decorative, never selectable (mirrors normalize).
  { group: 'nodes', selectable: false, data: { id: 'ns', isNamespace: true, label: 'shop' } },
  // Controller group: detail-eligible, so it stays SELECTABLE (no selectable:false) — its
  // clicks must reach the detail panel (mirrors normalize).
  { group: 'nodes', data: { id: 'ctrl', isController: true, kind: 'statefulset', label: 'mongo' } },
];

function renderCanvas(handlers: {
  onSelect?: (id: string | null) => void;
  onContextSelect?: (id: string) => void;
}): ReturnType<typeof render> {
  return render(
    <GraphCanvas
      elements={elements}
      stylesheet={[]}
      layout="fcose"
      visibility={{ visibleNodeIds: new Set(['p1', 'cl', 'ns', 'ctrl']), visibleEdgeIds: new Set() }}
      selectedId={null}
      {...handlers}
    />
  );
}

describe('GraphCanvas right-click (cxttap) wiring', () => {
  beforeEach(() => {
    mockCyRef.current = cytoscape({ headless: true, elements });
  });

  afterEach(() => {
    mockCyRef.current?.destroy();
    mockCyRef.current = null;
  });

  it('reports a selectable node through onContextSelect on cxttap', () => {
    const onContextSelect = jest.fn();
    renderCanvas({ onContextSelect });
    mockCyRef.current!.getElementById('p1').emit('cxttap');
    expect(onContextSelect).toHaveBeenCalledTimes(1);
    expect(onContextSelect).toHaveBeenCalledWith('p1');
  });

  it('ignores cxttap on the background and on non-selectable cluster / namespace backplates', () => {
    const onContextSelect = jest.fn();
    renderCanvas({ onContextSelect });
    mockCyRef.current!.emit('cxttap'); // background
    mockCyRef.current!.getElementById('cl').emit('cxttap'); // decorative cluster
    mockCyRef.current!.getElementById('ns').emit('cxttap'); // decorative namespace group
    expect(onContextSelect).not.toHaveBeenCalled();
  });

  it('routes a selectable controller group through both tap and cxttap (detail panel must open)', () => {
    // Regression: a controller is detail-eligible, so normalize keeps it selectable.
    // If it were selectable:false (like the decorative groups) the canvas gate would
    // silently drop every controller click and the detail panel would never open.
    const onSelect = jest.fn();
    const onContextSelect = jest.fn();
    renderCanvas({ onSelect, onContextSelect });
    mockCyRef.current!.getElementById('ctrl').emit('tap');
    expect(onSelect).toHaveBeenCalledWith('ctrl');
    mockCyRef.current!.getElementById('ctrl').emit('cxttap');
    expect(onContextSelect).toHaveBeenCalledWith('ctrl');
  });

  it('does not route cxttap through the left-tap onSelect path (and vice versa)', () => {
    const onSelect = jest.fn();
    const onContextSelect = jest.fn();
    renderCanvas({ onSelect, onContextSelect });
    mockCyRef.current!.getElementById('p1').emit('cxttap');
    expect(onContextSelect).toHaveBeenCalledWith('p1');
    expect(onSelect).not.toHaveBeenCalled();
    mockCyRef.current!.getElementById('p1').emit('tap');
    expect(onSelect).toHaveBeenCalledWith('p1');
    expect(onContextSelect).toHaveBeenCalledTimes(1);
  });

  it('suppresses the native context menu over the canvas while wired', () => {
    renderCanvas({ onContextSelect: jest.fn() });
    // fireEvent returns false when preventDefault was called on the event.
    expect(fireEvent.contextMenu(screen.getByTestId('graph-canvas'))).toBe(false);
  });

  it('leaves the native context menu alone when onContextSelect is not wired', () => {
    renderCanvas({});
    expect(fireEvent.contextMenu(screen.getByTestId('graph-canvas'))).toBe(true);
  });

  it('unbinds the cxttap handler on unmount (no listener residue)', () => {
    const onContextSelect = jest.fn();
    const { unmount } = renderCanvas({ onContextSelect });
    unmount();
    mockCyRef.current!.getElementById('p1').emit('cxttap');
    expect(onContextSelect).not.toHaveBeenCalled();
  });
});
