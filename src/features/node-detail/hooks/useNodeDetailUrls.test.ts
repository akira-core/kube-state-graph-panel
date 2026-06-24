import { act, renderHook, waitFor } from '@testing-library/react';

// Evaluated lazily (inside getBackendSrv calls at hook run time), so the const is
// initialized before the factory closure ever dereferences it.
const mockGet = jest.fn();

jest.mock('@grafana/runtime', () => ({
  getBackendSrv: (): { get: typeof mockGet } => ({ get: mockGet }),
}));

import { useNodeDetailUrls, type NodeDetailQueryInput } from './useNodeDetailUrls';

const input: NodeDetailQueryInput = { application: 'checkout', kind: 'deployment', name: 'gateway', time: 1717500000 };
const params = { application: 'checkout', kind: 'deployment', name: 'gateway', time: 1717500000 };

const appOk = { url: 'https://argo/app/checkout' };
const codeOk = { app: { url: 'https://x/app' }, sidecar: { url: 'https://x/sc' } };

function routeGet(appResult: Promise<unknown>, codeResult: Promise<unknown>): void {
  mockGet.mockImplementation((url: string) => (url.includes('config_changes') ? appResult : codeResult));
}

function configCalls(): unknown[][] {
  return (mockGet.mock.calls as unknown[][]).filter((c) => String(c[0]).includes('config_changes'));
}

function codeCalls(): unknown[][] {
  return (mockGet.mock.calls as unknown[][]).filter((c) => String(c[0]).includes('code_changes'));
}

describe('useNodeDetailUrls (eager prefetch, no click triggers)', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('prefetches BOTH endpoints on mount when enabled, with no click', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/api/ds/proxy/1'));

    await waitFor(() => {
      expect(result.current.application.status).toBe('ready');
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenCalledWith(
      '/api/ds/proxy/1/config_changes',
      params,
      undefined,
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) as AbortSignal, showErrorAlert: false })
    );
    expect(mockGet).toHaveBeenCalledWith(
      '/api/ds/proxy/1/code_changes',
      params,
      undefined,
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) as AbortSignal, showErrorAlert: false })
    );
    expect(result.current.enabled).toBe(true);
  });

  it('strips trailing slashes off the endpoint before appending the sub-path', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/api/ds/proxy/1//'));
    await waitFor(() => {
      expect(result.current.application.status).toBe('ready');
    });
    expect(mockGet).toHaveBeenCalledWith('/api/ds/proxy/1/config_changes', params, undefined, expect.anything());
    expect(mockGet).toHaveBeenCalledWith('/api/ds/proxy/1/code_changes', params, undefined, expect.anything());
  });

  it('exposes the resolved application URL and container map on success', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));

    await waitFor(() => {
      expect(result.current.application).toEqual({ status: 'ready', url: 'https://argo/app/checkout' });
    });
    await waitFor(() => {
      expect(result.current.containers.phase).toBe('settled');
    });
    expect(result.current.containers.byName['app']).toEqual({ status: 'ready', url: 'https://x/app' });
    expect(result.current.containers.byName['sidecar']).toEqual({ status: 'ready', url: 'https://x/sc' });
  });

  it('shows loading on both targets immediately after mount while the queries are in flight', () => {
    routeGet(new Promise(() => undefined), new Promise(() => undefined)); // never settles
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    expect(result.current.application).toEqual({ status: 'loading' });
    expect(result.current.containers.phase).toBe('loading');
  });

  it('leaves a container absent from the resolved map undefined (settled)', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.containers.phase).toBe('settled');
    });
    expect(result.current.containers.byName['missing']).toBeUndefined();
  });

  it('surfaces a failed (non-200) application query as unavailable with the backend message', async () => {
    routeGet(
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- FetchError-shaped plain object is the realistic BackendSrv rejection
      Promise.reject({ statusText: 'Not Found' }),
      Promise.resolve(codeOk)
    );
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.application).toEqual({ status: 'unavailable', error: 'Not Found' });
    });
  });

  it('falls back to "Not Found" on a malformed (200 but shapeless) application response', async () => {
    routeGet(Promise.resolve('not-an-object'), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.application).toEqual({ status: 'unavailable', error: 'Not Found' });
    });
  });

  it('settles containers with an empty map when code_changes fails', async () => {
    routeGet(
      Promise.resolve(appOk),
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- FetchError-shaped plain object is the realistic BackendSrv rejection
      Promise.reject({ statusText: 'Not Found' })
    );
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.containers.phase).toBe('settled');
    });
    expect(result.current.containers.byName['app']).toBeUndefined();
  });

  it('is disabled and never queries when input is undefined', () => {
    const { result } = renderHook(() => useNodeDetailUrls(undefined, '/proxy'));
    expect(result.current.enabled).toBe(false);
    expect(result.current.application).toEqual({ status: 'unavailable' });
    expect(result.current.containers).toEqual({ phase: 'settled', byName: {} });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('is disabled and never queries when the endpoint is blank', () => {
    const { result } = renderHook(() => useNodeDetailUrls(input, '  '));
    expect(result.current.enabled).toBe(false);
    expect(result.current.application).toEqual({ status: 'unavailable' });
    expect(result.current.containers).toEqual({ phase: 'settled', byName: {} });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('re-prefetches and replaces stale state when the selected node changes', async () => {
    // First node resolves to the shared fixtures.
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result, rerender } = renderHook(({ i }: { i: NodeDetailQueryInput }) => useNodeDetailUrls(i, '/proxy'), {
      initialProps: { i: input },
    });
    await waitFor(() => {
      expect(result.current.application).toEqual({ status: 'ready', url: 'https://argo/app/checkout' });
    });

    // Switch the route to the second node's payloads before rerendering.
    const appOk2 = { url: 'https://argo/app/other' };
    const codeOk2 = { worker: { url: 'https://y/worker' } };
    routeGet(Promise.resolve(appOk2), Promise.resolve(codeOk2));
    rerender({ i: { ...input, name: 'other' } });

    // The new key re-prefetches: get fires again for both endpoints.
    await waitFor(() => {
      expect(result.current.application).toEqual({ status: 'ready', url: 'https://argo/app/other' });
    });
    await waitFor(() => {
      expect(result.current.containers.byName['worker']).toEqual({ status: 'ready', url: 'https://y/worker' });
    });
    // Old container entries are gone.
    expect(result.current.containers.byName['app']).toBeUndefined();
    expect(result.current.containers.byName['sidecar']).toBeUndefined();
    expect(configCalls()).toHaveLength(2);
    expect(codeCalls()).toHaveLength(2);
  });

  it('fetches each endpoint exactly once per open node (no clicks, shared cache)', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.application.status).toBe('ready');
    });
    await waitFor(() => {
      expect(result.current.containers.phase).toBe('settled');
    });
    expect(configCalls()).toHaveLength(1);
    expect(codeCalls()).toHaveLength(1);
  });

  it('does not refetch when the same node re-renders with a fresh-identity, same-value input', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result, rerender } = renderHook(({ i }: { i: NodeDetailQueryInput }) => useNodeDetailUrls(i, '/proxy'), {
      initialProps: { i: input },
    });
    await waitFor(() => {
      expect(result.current.application).toEqual({ status: 'ready', url: 'https://argo/app/checkout' });
    });
    expect(configCalls()).toHaveLength(1);
    expect(codeCalls()).toHaveLength(1);

    // A data refresh rebuilds detailQueryInput: a NEW object identity with identical
    // values (same request key). The effect is keyed on the request-key STRING, so it
    // MUST NOT re-run, re-fire the queries, or flash the resolved anchors back to loading.
    rerender({ i: { ...input } });
    rerender({ i: { ...input } });
    await waitFor(() => {
      expect(result.current.application).toEqual({ status: 'ready', url: 'https://argo/app/checkout' });
    });
    expect(configCalls()).toHaveLength(1);
    expect(codeCalls()).toHaveLength(1);
    expect(result.current.containers.byName['app']).toEqual({ status: 'ready', url: 'https://x/app' });
  });

  it('re-prefetches code_changes after the selected node changes (cache cleared on key change)', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result, rerender } = renderHook(({ i }: { i: NodeDetailQueryInput }) => useNodeDetailUrls(i, '/proxy'), {
      initialProps: { i: input },
    });
    await waitFor(() => {
      expect(codeCalls()).toHaveLength(1);
    });
    rerender({ i: { ...input, name: 'other' } });
    await waitFor(() => {
      expect(codeCalls()).toHaveLength(2);
    });
    // settle the second pass so no act warning trails after the test
    await waitFor(() => {
      expect(result.current.containers.phase).toBe('settled');
    });
  });

  it('does not cache a failed prefetch — a remount of the same key refetches', async () => {
    let codeCall = 0;
    mockGet.mockImplementation((url: string) => {
      if (url.includes('config_changes')) {
        return Promise.resolve(appOk);
      }
      codeCall += 1;
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- FetchError-shaped rejection
      return codeCall === 1 ? Promise.reject({ statusText: 'Not Found' }) : Promise.resolve(codeOk);
    });
    const first = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(first.result.current.containers.phase).toBe('settled');
    });
    expect(first.result.current.containers.byName['app']).toBeUndefined();
    first.unmount();

    // Remount the SAME key: the failed slot was cleared, so a second fetch fires.
    const second = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(second.result.current.containers.byName['app']).toEqual({ status: 'ready', url: 'https://x/app' });
    });
    expect(codeCall).toBe(2);
  });

  it('aborts an in-flight request on unmount (signal flips, no late state write)', () => {
    routeGet(new Promise(() => undefined), new Promise(() => undefined)); // never settles
    const { unmount } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    const firstCall = mockGet.mock.calls[0] as unknown[];
    const options = firstCall[3] as { abortSignal: AbortSignal };
    expect(options.abortSignal.aborted).toBe(false);
    unmount();
    expect(options.abortSignal.aborted).toBe(true);
  });

  it('aborts the previous key’s in-flight request when the selected node changes', () => {
    routeGet(new Promise(() => undefined), new Promise(() => undefined)); // never settles
    const { rerender } = renderHook(({ i }: { i: NodeDetailQueryInput }) => useNodeDetailUrls(i, '/proxy'), {
      initialProps: { i: input },
    });
    const firstCall = mockGet.mock.calls[0] as unknown[];
    const options = firstCall[3] as { abortSignal: AbortSignal };
    expect(options.abortSignal.aborted).toBe(false);
    rerender({ i: { ...input, name: 'other' } });
    expect(options.abortSignal.aborted).toBe(true);
  });

  it('does not write the old node’s result after a node change aborts it', async () => {
    // Hold the first key's resolvers so we can settle them AFTER rerendering away.
    let resolveOldApp!: (v: unknown) => void;
    let resolveOldCode!: (v: unknown) => void;
    const oldApp = new Promise((res) => {
      resolveOldApp = res;
    });
    const oldCode = new Promise((res) => {
      resolveOldCode = res;
    });
    routeGet(oldApp, oldCode);
    const { result, rerender } = renderHook(({ i }: { i: NodeDetailQueryInput }) => useNodeDetailUrls(i, '/proxy'), {
      initialProps: { i: input },
    });
    // First pass in flight (loading).
    expect(result.current.application).toEqual({ status: 'loading' });

    // Switch to a new node; the new key resolves cleanly.
    const appOk2 = { url: 'https://argo/app/other' };
    const codeOk2 = { worker: { url: 'https://y/worker' } };
    routeGet(Promise.resolve(appOk2), Promise.resolve(codeOk2));
    rerender({ i: { ...input, name: 'other' } });
    await waitFor(() => {
      expect(result.current.application).toEqual({ status: 'ready', url: 'https://argo/app/other' });
    });

    // Now settle the OLD (aborted) promises — they must NOT clobber the new state.
    await act(async () => {
      resolveOldApp(appOk);
      resolveOldCode(codeOk);
      await Promise.resolve();
    });
    expect(result.current.application).toEqual({ status: 'ready', url: 'https://argo/app/other' });
    expect(result.current.containers.byName['app']).toBeUndefined();
    expect(result.current.containers.byName['sidecar']).toBeUndefined();
    expect(result.current.containers.byName['worker']).toEqual({ status: 'ready', url: 'https://y/worker' });
  });

  // --- diff timestamps (current → prev), RFC 3339, best-effort ---

  it('carries the RFC 3339 diff timestamps on a ready application lookup', async () => {
    const appWithTimes = {
      url: 'https://argo/app/checkout',
      current_time: '2026-06-16T10:30:00Z',
      previous_time: '2026-06-10T08:00:00Z',
    };
    routeGet(Promise.resolve(appWithTimes), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.application).toEqual({
        status: 'ready',
        url: 'https://argo/app/checkout',
        currentTime: '2026-06-16T10:30:00Z',
        previousTime: '2026-06-10T08:00:00Z',
      });
    });
  });

  it('carries the diff timestamps per container on ready lookups', async () => {
    const codeWithTimes = {
      app: { url: 'https://x/app', current_time: '2026-06-16T10:30:00Z', previous_time: '2026-06-10T08:00:00Z' },
    };
    routeGet(Promise.resolve(appOk), Promise.resolve(codeWithTimes));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.containers.byName['app']).toEqual({
        status: 'ready',
        url: 'https://x/app',
        currentTime: '2026-06-16T10:30:00Z',
        previousTime: '2026-06-10T08:00:00Z',
      });
    });
  });

  it('omits the timestamp keys (not undefined) when the backend sends only a url', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.application.status).toBe('ready');
    });
    const app = result.current.application;
    expect(app).toEqual({ status: 'ready', url: 'https://argo/app/checkout' });
    expect(Object.hasOwn(app, 'currentTime')).toBe(false);
    expect(Object.hasOwn(app, 'previousTime')).toBe(false);
  });

  it('drops a non-string / empty timestamp but keeps the url (best-effort)', async () => {
    const appBadTime = { url: 'https://argo/app/checkout', current_time: 123, previous_time: '' };
    routeGet(Promise.resolve(appBadTime), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.application).toEqual({ status: 'ready', url: 'https://argo/app/checkout' });
    });
  });

  it('drops a container entry missing a url even if it carries timestamps', async () => {
    const codeNoUrl = { app: { current_time: '2026-06-16T10:30:00Z', previous_time: '2026-06-10T08:00:00Z' } };
    routeGet(Promise.resolve(appOk), Promise.resolve(codeNoUrl));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.containers.phase).toBe('settled');
    });
    expect(result.current.containers.byName['app']).toBeUndefined();
  });

  // --- result_type (change type), best-effort, containers only ---

  it('carries result_type per container on ready lookups', async () => {
    const codeWithType = { app: { url: 'https://x/app', result_type: 'UPDATED' } };
    routeGet(Promise.resolve(appOk), Promise.resolve(codeWithType));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.containers.byName['app']).toEqual({
        status: 'ready',
        url: 'https://x/app',
        resultType: 'UPDATED',
      });
    });
  });

  it('omits the result_type key (not undefined) when the backend sends only a url', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.containers.phase).toBe('settled');
    });
    const app = result.current.containers.byName['app'];
    expect(app).toEqual({ status: 'ready', url: 'https://x/app' });
    expect(Object.hasOwn(app ?? {}, 'resultType')).toBe(false);
  });

  it('drops a non-string / empty result_type but keeps the url (best-effort)', async () => {
    const codeBadType = {
      app: { url: 'https://x/app', result_type: 123 },
      sidecar: { url: 'https://x/sc', result_type: '' },
    };
    routeGet(Promise.resolve(appOk), Promise.resolve(codeBadType));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.containers.phase).toBe('settled');
    });
    expect(result.current.containers.byName['app']).toEqual({ status: 'ready', url: 'https://x/app' });
    expect(result.current.containers.byName['sidecar']).toEqual({ status: 'ready', url: 'https://x/sc' });
  });

  it('does not carry result_type on a ready application lookup (config_changes has no result_type)', async () => {
    const appWithType = { url: 'https://argo/app/checkout', result_type: 'UPDATED' };
    routeGet(Promise.resolve(appWithType), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.application.status).toBe('ready');
    });
    expect(Object.hasOwn(result.current.application, 'resultType')).toBe(false);
  });
});
