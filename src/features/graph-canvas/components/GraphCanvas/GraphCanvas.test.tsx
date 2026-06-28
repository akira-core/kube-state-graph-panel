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

function renderCanvas(handlers: { onSelect?: (id: string | null) => void }): ReturnType<typeof render> {
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

describe('GraphCanvas selection wiring (left-click only; right-click detail removed)', () => {
  beforeEach(() => {
    mockCyRef.current = cytoscape({ headless: true, elements });
  });

  afterEach(() => {
    mockCyRef.current?.destroy();
    mockCyRef.current = null;
  });

  it('a right-click (cxttap) on a node does NOT trigger selection (detail flow removed)', () => {
    const onSelect = jest.fn();
    renderCanvas({ onSelect });
    mockCyRef.current!.getElementById('p1').emit('cxttap');
    mockCyRef.current!.getElementById('ctrl').emit('cxttap');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('left-tap still selects a selectable node, including a controller group', () => {
    const onSelect = jest.fn();
    renderCanvas({ onSelect });
    mockCyRef.current!.getElementById('p1').emit('tap');
    expect(onSelect).toHaveBeenCalledWith('p1');
    mockCyRef.current!.getElementById('ctrl').emit('tap');
    expect(onSelect).toHaveBeenCalledWith('ctrl');
  });

  it('leaves the native context menu alone (right-click is no longer intercepted)', () => {
    renderCanvas({ onSelect: jest.fn() });
    // fireEvent returns true when preventDefault was NOT called on the event.
    expect(fireEvent.contextMenu(screen.getByTestId('graph-canvas'))).toBe(true);
  });

  it('forwards the pinned tooltip to HoverTooltip (top-right card shows with no hovered element)', () => {
    render(
      <GraphCanvas
        elements={elements}
        stylesheet={[]}
        layout="fcose"
        visibility={{ visibleNodeIds: new Set(['p1', 'cl', 'ns', 'ctrl']), visibleEdgeIds: new Set() }}
        selectedId="ctrl"
        pinned={{ label: 'mongo', attributes: [{ key: 'kind', value: 'statefulset' }] }}
      />
    );
    const tip = screen.getByTestId('hover-tooltip');
    expect(tip).toHaveAttribute('data-pinned', 'true');
    expect(screen.getByText('mongo')).toBeInTheDocument();
  });
});
