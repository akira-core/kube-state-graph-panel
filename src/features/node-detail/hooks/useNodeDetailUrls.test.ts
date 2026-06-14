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

describe('useNodeDetailUrls (lazy, click-triggered)', () => {
  let openSpy: jest.SpyInstance;

  beforeEach(() => {
    mockGet.mockReset();
    // jsdom's window.open is a no-op returning null; default to a truthy window so
    // "success opens a tab" is the default (the pop-up-blocked test overrides it).
    openSpy = jest.spyOn(window, 'open').mockReturnValue({} as Window);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('does not query on mount or input change — idle until a button is triggered', () => {
    const { result, rerender } = renderHook(({ i }: { i: NodeDetailQueryInput }) => useNodeDetailUrls(i, '/proxy'), {
      initialProps: { i: input },
    });
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(true);
    expect(result.current.application).toEqual({ status: 'idle' });
    expect(result.current.containers).toEqual({});

    rerender({ i: { ...input, name: 'other' } });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('openApplicationReport fires config_changes and opens the resolved URL in a new tab', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/api/ds/proxy/1'));

    act(() => {
      result.current.openApplicationReport();
    });
    await waitFor(() => {
      expect(result.current.application.status).toBe('idle');
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(
      '/api/ds/proxy/1/config_changes',
      params,
      undefined,
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) as AbortSignal })
    );
    expect(openSpy).toHaveBeenCalledWith('https://argo/app/checkout', '_blank', 'noopener,noreferrer');
  });

  it('strips trailing slashes off the endpoint before appending the sub-path', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/api/ds/proxy/1//'));
    act(() => {
      result.current.openApplicationReport();
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled();
    });
    expect(mockGet).toHaveBeenCalledWith('/api/ds/proxy/1/config_changes', params, undefined, expect.anything());
  });

  it('openContainerReport fires code_changes and opens that container’s URL', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));

    act(() => {
      result.current.openContainerReport('app');
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith('https://x/app', '_blank', 'noopener,noreferrer');
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/proxy/code_changes', params, undefined, expect.anything());
    expect(result.current.containers.app).toEqual({ status: 'idle' });
  });

  it('shows loading on the triggered target while the query is in flight', () => {
    routeGet(new Promise(() => undefined), new Promise(() => undefined)); // never settles
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    act(() => {
      result.current.openApplicationReport();
    });
    expect(result.current.application).toEqual({ status: 'loading' });
  });

  it('marks the container "Not Found" when its name is absent from the map (no tab opened)', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    act(() => {
      result.current.openContainerReport('missing');
    });
    await waitFor(() => {
      expect(result.current.containers.missing).toEqual({ status: 'error', error: 'Not Found' });
    });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('surfaces a failed (non-200) application query as an error and opens no tab', async () => {
    routeGet(
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- FetchError-shaped plain object is the realistic BackendSrv rejection
      Promise.reject({ statusText: 'Not Found' }),
      Promise.resolve(codeOk)
    );
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    act(() => {
      result.current.openApplicationReport();
    });
    await waitFor(() => {
      expect(result.current.application).toEqual({ status: 'error', error: 'Not Found' });
    });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('falls back to "Not Found" on a malformed (200 but shapeless) application response', async () => {
    routeGet(Promise.resolve('not-an-object'), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    act(() => {
      result.current.openApplicationReport();
    });
    await waitFor(() => {
      expect(result.current.application).toEqual({ status: 'error', error: 'Not Found' });
    });
  });

  it('reports "Pop-up blocked" when the browser blocks the new tab (window.open → null)', async () => {
    openSpy.mockReturnValue(null);
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    act(() => {
      result.current.openApplicationReport();
    });
    await waitFor(() => {
      expect(result.current.application).toEqual({ status: 'error', error: 'Pop-up blocked' });
    });
  });

  it('is disabled and never queries when input is undefined', () => {
    const { result } = renderHook(() => useNodeDetailUrls(undefined, '/proxy'));
    expect(result.current.enabled).toBe(false);
    act(() => {
      result.current.openApplicationReport();
      result.current.openContainerReport('app');
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('is disabled and never queries when the endpoint is blank', () => {
    const { result } = renderHook(() => useNodeDetailUrls(input, '  '));
    expect(result.current.enabled).toBe(false);
    act(() => {
      result.current.openApplicationReport();
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('resets every button back to idle when the selected node changes', async () => {
    routeGet(
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- FetchError-shaped plain object is the realistic BackendSrv rejection
      Promise.reject({ statusText: 'Not Found' }),
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- FetchError-shaped plain object is the realistic BackendSrv rejection
      Promise.reject({ statusText: 'Not Found' })
    );
    const { result, rerender } = renderHook(({ i }: { i: NodeDetailQueryInput }) => useNodeDetailUrls(i, '/proxy'), {
      initialProps: { i: input },
    });
    act(() => {
      result.current.openApplicationReport();
      result.current.openContainerReport('app');
    });
    await waitFor(() => {
      expect(result.current.application.status).toBe('error');
    });

    rerender({ i: { ...input, name: 'other' } });
    expect(result.current.application).toEqual({ status: 'idle' });
    expect(result.current.containers).toEqual({});
  });

  it('fetches code_changes once for multiple container clicks, sharing the cached map', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    act(() => {
      result.current.openContainerReport('app');
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith('https://x/app', '_blank', 'noopener,noreferrer');
    });
    act(() => {
      result.current.openContainerReport('sidecar');
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith('https://x/sc', '_blank', 'noopener,noreferrer');
    });
    // Both rows opened, but only ONE code_changes request fired (shared cache).
    const codeCalls = mockGet.mock.calls.filter((c: unknown[]) => String(c[0]).includes('code_changes'));
    expect(codeCalls).toHaveLength(1);
  });

  it('refetches code_changes after the selected node changes (cache cleared on close)', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result, rerender } = renderHook(({ i }: { i: NodeDetailQueryInput }) => useNodeDetailUrls(i, '/proxy'), {
      initialProps: { i: input },
    });
    act(() => {
      result.current.openContainerReport('app');
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledTimes(1);
    });
    rerender({ i: { ...input, name: 'other' } });
    act(() => {
      result.current.openContainerReport('app');
    });
    await waitFor(() => {
      expect(mockGet.mock.calls.filter((c: unknown[]) => String(c[0]).includes('code_changes'))).toHaveLength(2);
    });
  });

  it('does not cache a failed code_changes lookup — a retry refetches', async () => {
    let codeCall = 0;
    mockGet.mockImplementation((url: string) => {
      if (url.includes('config_changes')) {
        return Promise.resolve(appOk);
      }
      codeCall += 1;
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- FetchError-shaped rejection
      return codeCall === 1 ? Promise.reject({ statusText: 'Not Found' }) : Promise.resolve(codeOk);
    });
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    act(() => {
      result.current.openContainerReport('app');
    });
    await waitFor(() => {
      expect(result.current.containers.app).toEqual({ status: 'error', error: 'Not Found' });
    });
    act(() => {
      result.current.openContainerReport('app');
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith('https://x/app', '_blank', 'noopener,noreferrer');
    });
    expect(codeCall).toBe(2);
  });

  it('fetches config_changes once across application re-clicks (cached), reopening from cache', async () => {
    routeGet(Promise.resolve(appOk), Promise.resolve(codeOk));
    const { result } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    act(() => {
      result.current.openApplicationReport();
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledTimes(1);
    });
    act(() => {
      result.current.openApplicationReport();
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledTimes(2); // reopened from the cached URL
    });
    expect(mockGet.mock.calls.filter((c: unknown[]) => String(c[0]).includes('config_changes'))).toHaveLength(1);
  });

  it('aborts an in-flight request on unmount (signal flips, no late state write)', () => {
    routeGet(new Promise(() => undefined), new Promise(() => undefined)); // never settles
    const { result, unmount } = renderHook(() => useNodeDetailUrls(input, '/proxy'));
    act(() => {
      result.current.openApplicationReport();
    });
    const firstCall = mockGet.mock.calls[0] as unknown[];
    const options = firstCall[3] as { abortSignal: AbortSignal };
    expect(options.abortSignal.aborted).toBe(false);
    unmount();
    expect(options.abortSignal.aborted).toBe(true);
  });
});
