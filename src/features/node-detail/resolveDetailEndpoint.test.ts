import type { DataQueryRequest } from '@grafana/data';

import { resolveDetailEndpoint } from './resolveDetailEndpoint';

const getInstanceSettingsMock = jest.fn();
jest.mock('@grafana/runtime', () => ({
  getDataSourceSrv: (): { getInstanceSettings: typeof getInstanceSettingsMock } => ({
    getInstanceSettings: getInstanceSettingsMock,
  }),
}));

// Only `targets` matters to the resolver; the rest of DataQueryRequest is noise.
function requestWith(targets: unknown[]): DataQueryRequest {
  return { targets } as unknown as DataQueryRequest;
}

const refTarget = { refId: 'A', datasource: { uid: 'ksg-default', type: 'yesoreyeram-infinity-datasource' } };

describe('resolveDetailEndpoint', () => {
  beforeEach(() => {
    getInstanceSettingsMock.mockReset();
  });

  it('returns the trimmed option as an override without touching the runtime', () => {
    expect(resolveDetailEndpoint({ option: ' /proxy ', request: requestWith([refTarget]) })).toBe('/proxy');
    expect(getInstanceSettingsMock).not.toHaveBeenCalled();
  });

  it('returns empty without a request, and never touches the runtime', () => {
    expect(resolveDetailEndpoint({ option: '', request: undefined })).toBe('');
    expect(getInstanceSettingsMock).not.toHaveBeenCalled();
  });

  it('returns empty when no target carries a datasource ref, and never touches the runtime', () => {
    expect(
      resolveDetailEndpoint({ option: '', request: requestWith([{ refId: 'A' }, { refId: 'B', datasource: null }]) })
    ).toBe('');
    expect(getInstanceSettingsMock).not.toHaveBeenCalled();
  });

  it("derives the proxied base path from the first ref'd target", () => {
    getInstanceSettingsMock.mockReturnValue({ url: '/api/datasources/proxy/uid/ksg-default' });
    expect(resolveDetailEndpoint({ option: '', request: requestWith([{ refId: 'A' }, refTarget]) })).toBe(
      '/api/datasources/proxy/uid/ksg-default'
    );
    expect(getInstanceSettingsMock).toHaveBeenCalledWith(refTarget.datasource);
  });

  it('returns empty when the runtime knows no such datasource', () => {
    getInstanceSettingsMock.mockReturnValue(undefined);
    expect(resolveDetailEndpoint({ option: '', request: requestWith([refTarget]) })).toBe('');
  });

  it('returns empty when the instance settings carry no url', () => {
    getInstanceSettingsMock.mockReturnValue({ url: '' });
    expect(resolveDetailEndpoint({ option: '', request: requestWith([refTarget]) })).toBe('');
  });

  it('falls through a whitespace-only option to derivation', () => {
    getInstanceSettingsMock.mockReturnValue({ url: '/api/datasources/proxy/uid/ksg-default' });
    expect(resolveDetailEndpoint({ option: '   ', request: requestWith([refTarget]) })).toBe(
      '/api/datasources/proxy/uid/ksg-default'
    );
  });

  it('skips hidden targets', () => {
    getInstanceSettingsMock.mockReturnValue({ url: '/api/datasources/proxy/uid/ksg-default' });
    const hidden = { refId: 'H', hide: true, datasource: { uid: 'other-ds' } };
    expect(resolveDetailEndpoint({ option: '', request: requestWith([hidden, refTarget]) })).toBe(
      '/api/datasources/proxy/uid/ksg-default'
    );
    expect(getInstanceSettingsMock).toHaveBeenCalledTimes(1);
    expect(getInstanceSettingsMock).toHaveBeenCalledWith(refTarget.datasource);
  });

  it("skips a ref that resolves to no usable url (e.g. an expression's __expr__) and derives from the next", () => {
    getInstanceSettingsMock
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ url: '/api/datasources/proxy/uid/ksg-default' });
    const expr = { refId: 'E', datasource: { uid: '__expr__', type: '__expr__' } };
    expect(resolveDetailEndpoint({ option: '', request: requestWith([expr, refTarget]) })).toBe(
      '/api/datasources/proxy/uid/ksg-default'
    );
    expect(getInstanceSettingsMock).toHaveBeenCalledTimes(2);
  });
});
