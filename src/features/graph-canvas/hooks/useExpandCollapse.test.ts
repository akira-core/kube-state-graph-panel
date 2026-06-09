import { renderHook } from '@testing-library/react';
import cytoscape from 'cytoscape';
import type { MutableRefObject } from 'react';

import { useExpandCollapse } from './useExpandCollapse';

interface FakeApi {
  expandAll: jest.Mock;
  collapse: jest.Mock;
  getCollapsedChildren: jest.Mock;
}

function setup(): {
  cy: cytoscape.Core;
  cyRef: MutableRefObject<cytoscape.Core | null>;
  api: FakeApi;
  handlers: Record<string, (e: unknown) => void>;
} {
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      { group: 'nodes', data: { id: 'cl', isCluster: true } },
      { group: 'nodes', data: { id: 'p1', parent: 'cl', kind: 'pod' } },
    ],
  });
  const api: FakeApi = { expandAll: jest.fn(), collapse: jest.fn(), getCollapsedChildren: jest.fn() };
  // expand-collapse is not registered in jest — the extension property does not exist
  // on the headless cy instance, so jest.spyOn would throw "property does not exist".
  // Instead, directly assign a jest.fn() that returns the fake api. Tests can still
  // assert via `expect(cy.expandCollapse).toHaveBeenCalledWith(...)` because the
  // typed cast exposes the mock.
  const expandCollapseMock = jest.fn().mockReturnValue(api);
  (cy as unknown as { expandCollapse: jest.Mock }).expandCollapse = expandCollapseMock;
  const handlers: Record<string, (e: unknown) => void> = {};
  // Split space-separated event names so handlers['expandcollapse.aftercollapse'] resolves
  // correctly even though the hook binds BOTH events in a single cy.on() call.
  jest.spyOn(cy, 'on').mockImplementation(((evt: string, cb: (e: unknown) => void) => {
    for (const name of evt.split(/\s+/)) {
      handlers[name] = cb;
    }
    return cy;
  }) as never);
  const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
  return { cy, cyRef, api, handlers };
}

describe('useExpandCollapse', () => {
  it('initialises the api with layoutBy:null/animate:false/cueEnabled:true when enabled + ready', () => {
    const { cy, cyRef } = setup();
    const apiRef = { current: null } as MutableRefObject<unknown>;
    const collapsedIdsRef = { current: new Set<string>() };
    const suppressRef = { current: false };
    renderHook(() =>
      useExpandCollapse({
        cyRef,
        enabled: true,
        isReady: true,
        apiRef: apiRef as never,
        collapsedIdsRef,
        suppressRef,
        onCollapsedChange: jest.fn(),
      })
    );
    const expandCollapseMock = (cy as unknown as { expandCollapse: jest.Mock }).expandCollapse;
    expect(expandCollapseMock).toHaveBeenCalledWith(
      expect.objectContaining({ layoutBy: null, animate: false, cueEnabled: true })
    );
    expect(apiRef.current).not.toBeNull();
  });

  it('does nothing when not ready', () => {
    const { cy, cyRef } = setup();
    const apiRef = { current: null } as MutableRefObject<unknown>;
    renderHook(() =>
      useExpandCollapse({
        cyRef,
        enabled: true,
        isReady: false,
        apiRef: apiRef as never,
        collapsedIdsRef: { current: new Set() },
        suppressRef: { current: false },
        onCollapsedChange: jest.fn(),
      })
    );
    expect((cy as unknown as { expandCollapse: jest.Mock }).expandCollapse).not.toHaveBeenCalled();
    expect(apiRef.current).toBeNull();
  });

  it('does nothing when not enabled even if ready (never touches the unregistered extension)', () => {
    const { cy, cyRef } = setup();
    const apiRef = { current: null } as MutableRefObject<unknown>;
    renderHook(() =>
      useExpandCollapse({
        cyRef,
        enabled: false,
        isReady: true,
        apiRef: apiRef as never,
        collapsedIdsRef: { current: new Set() },
        suppressRef: { current: false },
        onCollapsedChange: jest.fn(),
      })
    );
    expect((cy as unknown as { expandCollapse: jest.Mock }).expandCollapse).not.toHaveBeenCalled();
    expect(apiRef.current).toBeNull();
  });

  it('calls onMountCollapseApplied after applying a non-empty mount collapse (forces a collapsed-graph relayout)', () => {
    const { cyRef } = setup();
    const onMountCollapseApplied = jest.fn();
    renderHook(() =>
      useExpandCollapse({
        cyRef,
        enabled: true,
        isReady: true,
        apiRef: { current: null },
        // 'cl' is a parent (has child p1) so it is in cy.nodes(':parent') → collapsed.
        collapsedIdsRef: { current: new Set(['cl']) },
        suppressRef: { current: false },
        onCollapsedChange: jest.fn(),
        onMountCollapseApplied,
      })
    );
    expect(onMountCollapseApplied).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onMountCollapseApplied when nothing is collapsed on mount', () => {
    const { cyRef } = setup();
    const onMountCollapseApplied = jest.fn();
    renderHook(() =>
      useExpandCollapse({
        cyRef,
        enabled: true,
        isReady: true,
        apiRef: { current: null },
        collapsedIdsRef: { current: new Set<string>() },
        suppressRef: { current: false },
        onCollapsedChange: jest.fn(),
        onMountCollapseApplied,
      })
    );
    expect(onMountCollapseApplied).not.toHaveBeenCalled();
  });

  it('reports the full collapsed Set from cue events when not suppressed', () => {
    const { cy, cyRef, handlers } = setup();
    cy.getElementById('cl').addClass('cy-expand-collapse-collapsed-node');
    const onCollapsedChange = jest.fn();
    renderHook(() =>
      useExpandCollapse({
        cyRef,
        enabled: true,
        isReady: true,
        apiRef: { current: null },
        collapsedIdsRef: { current: new Set() },
        suppressRef: { current: false },
        onCollapsedChange,
      })
    );
    handlers['expandcollapse.aftercollapse']?.({});
    expect(onCollapsedChange).toHaveBeenCalledWith(new Set(['cl']));
  });

  it('ignores cue events while suppressRef is true (programmatic guard)', () => {
    const { cy, cyRef, handlers } = setup();
    cy.getElementById('cl').addClass('cy-expand-collapse-collapsed-node');
    const onCollapsedChange = jest.fn();
    const suppressRef = { current: true };
    renderHook(() =>
      useExpandCollapse({
        cyRef,
        enabled: true,
        isReady: true,
        apiRef: { current: null },
        collapsedIdsRef: { current: new Set() },
        suppressRef,
        onCollapsedChange,
      })
    );
    handlers['expandcollapse.aftercollapse']?.({});
    expect(onCollapsedChange).not.toHaveBeenCalled();
  });
});
