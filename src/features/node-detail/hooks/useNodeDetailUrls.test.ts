import { renderHook, waitFor } from '@testing-library/react';

// Evaluated lazily (inside getBackendSrv calls at hook run time), so the const is
// initialized before the factory closure ever dereferences it.
const mockGet = jest.fn();

jest.mock('@grafana/runtime', () => ({
  getBackendSrv: (): { get: typeof mockGet } => ({ get: mockGet }),
}));

import { IDLE_NODE_DETAIL_URLS, useNodeDetailUrls, type NodeDetailQueryInput } from './useNodeDetailUrls';

const input: NodeDetailQueryInput = { application: 'checkout', kind: 'deployment', name: 'gateway', time: 1717500000 };

const appOk = { url: 'https://argo/app/checkout' };
const codeOk = { app: { url: 'https://x/app' }, sidecar: { url: 'https://x/sc' } };

// Route by sub-path so call order never matters.
function routeGet(appResult: Promise<unknown>, codeResult: Promise<unknown>): void {
  mockGet.mockImplementation((url: string) => (url.includes('config_changes') ? appResult : codeResult));
}

describe('useNodeDetailUrls', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('fires both queries in parallel with the shared params and parses both results', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/api/ds/proxy/1'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.applicationUrl).toBe('https://argo/app/checkout');
    expect(result.current.urlByContainer).toEqual({ app: 'https://x/app', sidecar: 'https://x/sc' });
    expect(result.current.applicationError).toBeUndefined();
    expect(result.current.containersError).toBeUndefined();
    expect(mockGet).toHaveBeenCalledTimes(2);
    const params = { application: 'checkout', kind: 'deployment', name: 'gateway', time: 1717500000 };
    expect(mockGet).toHaveBeenCalledWith(
      '/api/ds/proxy/1/api/v1/config_changes',
      params,
      undefined,
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) as AbortSignal })
    );
    expect(mockGet).toHaveBeenCalledWith(
      '/api/ds/proxy/1/api/v1/code_changes',
      params,
      undefined,
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) as AbortSignal })
    );
  });

  it('strips trailing slashes off the endpoint before appending the sub-paths', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/api/ds/proxy/1//'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(mockGet).toHaveBeenCalledWith('/api/ds/proxy/1/api/v1/config_changes', expect.anything(), undefined, expect.anything());
  });

  it('keeps the surviving side when one query fails (application fails, containers kept)', async () => {
    routeGet(Promise.reject(new Error('boom')), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.applicationUrl).toBeUndefined();
    expect(result.current.applicationError).toBe('boom');
    expect(result.current.urlByContainer).toEqual({ app: 'https://x/app', sidecar: 'https://x/sc' });
    expect(result.current.containersError).toBeUndefined();
  });

  it('reports both errors when both queries fail', async () => {
    routeGet(
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- FetchError-shaped plain object is the realistic BackendSrv rejection
      Promise.reject({ statusText: 'Bad Gateway' }),
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- FetchError-shaped plain object is the realistic BackendSrv rejection
      Promise.reject({ data: { message: 'backend down' } })
    );
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.applicationError).toBe('Bad Gateway');
    expect(result.current.containersError).toBe('backend down');
  });

  it('idles without querying when input is undefined', () => {
    const { result } = renderHook(() => useNodeDetailUrls(undefined, '/proxy'));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current).toEqual(IDLE_NODE_DETAIL_URLS);
  });

  it('idles without querying when the endpoint is empty/blank', () => {
    const { result } = renderHook(() => useNodeDetailUrls(input, '  '));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current).toEqual(IDLE_NODE_DETAIL_URLS);
  });

  it('flattens the nested code_changes response and drops malformed entries', async () => {
    routeGet(
      Promise.resolve(appOk),
      Promise.resolve({ good: { url: 'https://x/good' }, noUrl: {}, notObj: 'x', emptyUrl: { url: '' } })
    );
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.urlByContainer).toEqual({ good: 'https://x/good' });
    expect(result.current.containersError).toBeUndefined();
  });

  it("flags a shape-mismatched response as that side's error only", async () => {
    routeGet(Promise.resolve('not-an-object'), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.applicationUrl).toBeUndefined();
    expect(result.current.applicationError).toBe('Malformed application-detail response');
    expect(result.current.urlByContainer).toEqual({ app: 'https://x/app', sidecar: 'https://x/sc' });
  });

  it('aborts the in-flight request on unmount (signal flips, no late state write)', () => {
    routeGet(new Promise(() => undefined), new Promise(() => undefined)); // never settles
    const { unmount } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    const firstCall = mockGet.mock.calls[0] as unknown[];
    const options = firstCall[3] as { abortSignal: AbortSignal };
    expect(options.abortSignal.aborted).toBe(false);
    unmount();
    expect(options.abortSignal.aborted).toBe(true);
  });

  it('refetches on input change and discards the superseded pass', async () => {
    let resolveStaleApp: (v: unknown) => void = () => undefined;
    const staleApp = new Promise((resolve) => {
      resolveStaleApp = resolve;
    });
    routeGet(staleApp, new Promise(() => undefined));
    const { result, rerender } = renderHook(({ i }: { i: NodeDetailQueryInput }) => useNodeDetailUrls(i, '/proxy'), {
      initialProps: { i: input },
    });
    expect(mockGet).toHaveBeenCalledTimes(2);

    routeGet(Promise.resolve({ url: 'https://argo/app/fresh' }), Promise.resolve(codeOk));
    rerender({ i: { ...input, name: 'other' } });
    expect(mockGet).toHaveBeenCalledTimes(4);
    expect(mockGet).toHaveBeenLastCalledWith(
      '/proxy/api/v1/code_changes',
      expect.objectContaining({ name: 'other' }),
      undefined,
      expect.anything()
    );

    // Late-resolve the stale pass — its abort gate must keep it out of state.
    resolveStaleApp({ url: 'https://argo/app/stale' });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.applicationUrl).toBe('https://argo/app/fresh');
  });

  it('clears previous results back to idle when the input goes undefined (selection cleared)', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const initialProps: { i: NodeDetailQueryInput | undefined } = { i: input };
    const { result, rerender } = renderHook(
      ({ i }: { i: NodeDetailQueryInput | undefined }) => useNodeDetailUrls(i, '/proxy'),
      { initialProps }
    );
    await waitFor(() => {
      expect(result.current.applicationUrl).toBe('https://argo/app/checkout');
    });
    rerender({ i: undefined });
    expect(result.current).toEqual(IDLE_NODE_DETAIL_URLS);
  });
});
