import { renderHook, waitFor } from '@testing-library/react';

// Evaluated lazily inside getBackendSrv at hook run time, so initialized before the
// factory closure dereferences it.
const mockGet = jest.fn();

jest.mock('@grafana/runtime', () => ({
  getBackendSrv: (): { get: typeof mockGet } => ({ get: mockGet }),
}));

import type { DashboardParams } from '../assembleDashboardParams';

import { useNodeDashboardUrl } from './useNodeDashboardUrl';

const params: DashboardParams = { kind: 'pod', name: 'mongo-0', namespace: 'shop' };

describe('useNodeDashboardUrl (eager prefetch, open-driven)', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('fires one GET <base>/dashboard with the param map when params + base present', async () => {
    mockGet.mockResolvedValue({ url: 'https://dash/n1' });
    const { result } = renderHook(() => useNodeDashboardUrl(params, '/api/ds/proxy/1'));
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', url: 'https://dash/n1' });
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(
      '/api/ds/proxy/1/dashboard',
      params,
      undefined,
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) as AbortSignal, showErrorAlert: false })
    );
  });

  it('strips trailing slashes before appending the sub-path', async () => {
    mockGet.mockResolvedValue({ url: 'https://dash/n1' });
    const { result } = renderHook(() => useNodeDashboardUrl(params, '/proxy//'));
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(mockGet).toHaveBeenCalledWith('/proxy/dashboard', params, undefined, expect.anything());
  });

  it('200 + non-empty url → ready', async () => {
    mockGet.mockResolvedValue({ url: 'https://dash/n1' });
    const { result } = renderHook(() => useNodeDashboardUrl(params, '/proxy'));
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', url: 'https://dash/n1' });
    });
  });

  it('empty url → unavailable', async () => {
    mockGet.mockResolvedValue({ url: '' });
    const { result } = renderHook(() => useNodeDashboardUrl(params, '/proxy'));
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'unavailable' });
    });
  });

  it('malformed (200 but shapeless) body → unavailable', async () => {
    mockGet.mockResolvedValue('not-an-object');
    const { result } = renderHook(() => useNodeDashboardUrl(params, '/proxy'));
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'unavailable' });
    });
  });

  it('non-200 / network error → unavailable', async () => {
    mockGet.mockRejectedValue({ statusText: 'Not Found' });
    const { result } = renderHook(() => useNodeDashboardUrl(params, '/proxy'));
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'unavailable' });
    });
  });

  it('shows loading immediately while the query is in flight', () => {
    mockGet.mockReturnValue(new Promise(() => undefined)); // never settles
    const { result } = renderHook(() => useNodeDashboardUrl(params, '/proxy'));
    expect(result.current).toEqual({ status: 'loading' });
  });

  it('is idle (unavailable, no request) when params is undefined', () => {
    const { result } = renderHook(() => useNodeDashboardUrl(undefined, '/proxy'));
    expect(result.current).toEqual({ status: 'unavailable' });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('is idle (unavailable, no request) when the base is blank', () => {
    const { result } = renderHook(() => useNodeDashboardUrl(params, '  '));
    expect(result.current).toEqual({ status: 'unavailable' });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not refetch on a same-value, fresh-identity params re-render (at-most-once per open)', async () => {
    mockGet.mockResolvedValue({ url: 'https://dash/n1' });
    const { result, rerender } = renderHook(({ p }: { p: DashboardParams }) => useNodeDashboardUrl(p, '/proxy'), {
      initialProps: { p: params },
    });
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    rerender({ p: { ...params } });
    rerender({ p: { ...params } });
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', url: 'https://dash/n1' });
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('aborts the previous in-flight request and refetches when params change', () => {
    mockGet.mockReturnValue(new Promise(() => undefined)); // never settles
    const { rerender } = renderHook(({ p }: { p: DashboardParams }) => useNodeDashboardUrl(p, '/proxy'), {
      initialProps: { p: params },
    });
    const firstOpts = (mockGet.mock.calls[0] as unknown[])[3] as { abortSignal: AbortSignal };
    expect(firstOpts.abortSignal.aborted).toBe(false);
    rerender({ p: { ...params, name: 'mongo-1' } });
    expect(firstOpts.abortSignal.aborted).toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('aborts an in-flight request on unmount (no late state write)', () => {
    mockGet.mockReturnValue(new Promise(() => undefined)); // never settles
    const { unmount } = renderHook(() => useNodeDashboardUrl(params, '/proxy'));
    const opts = (mockGet.mock.calls[0] as unknown[])[3] as { abortSignal: AbortSignal };
    expect(opts.abortSignal.aborted).toBe(false);
    unmount();
    expect(opts.abortSignal.aborted).toBe(true);
  });
});
