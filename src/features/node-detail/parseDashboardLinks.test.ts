import { parseDashboardLinks } from './parseDashboardLinks';

describe('parseDashboardLinks', () => {
  it('parses legacy { url } as a single Dashboard link', () => {
    expect(parseDashboardLinks({ url: 'https://grafana/d/abc' })).toEqual([
      { label: 'Dashboard', url: 'https://grafana/d/abc' },
    ]);
  });

  it('parses { urls } with labels', () => {
    expect(
      parseDashboardLinks({
        urls: [
          { label: 'Metrics', url: 'https://grafana/d/metrics' },
          { label: 'Logs', url: 'https://grafana/d/logs' },
        ],
      })
    ).toEqual([
      { label: 'Metrics', url: 'https://grafana/d/metrics' },
      { label: 'Logs', url: 'https://grafana/d/logs' },
    ]);
  });

  it('prefers non-empty urls over legacy url', () => {
    expect(
      parseDashboardLinks({
        url: 'https://legacy',
        urls: [{ label: 'New', url: 'https://new' }],
      })
    ).toEqual([{ label: 'New', url: 'https://new' }]);
  });

  it('falls back to legacy url when urls is empty', () => {
    expect(parseDashboardLinks({ url: 'https://legacy', urls: [] })).toEqual([
      { label: 'Dashboard', url: 'https://legacy' },
    ]);
  });

  it('filters invalid url entries and keeps valid ones', () => {
    expect(
      parseDashboardLinks({
        urls: [{ label: 'Ok', url: 'https://ok' }, { url: '' }, null, { label: 'Also', url: 'https://also' }],
      })
    ).toEqual([
      { label: 'Ok', url: 'https://ok' },
      { label: 'Also', url: 'https://also' },
    ]);
  });

  it('derives label from URL pathname when label is missing', () => {
    expect(parseDashboardLinks({ urls: [{ url: 'https://grafana/d/node-metrics' }] })).toEqual([
      { label: 'node-metrics', url: 'https://grafana/d/node-metrics' },
    ]);
  });

  it('uses Dashboard / Dashboard N when label and pathname are unusable', () => {
    expect(
      parseDashboardLinks({
        urls: [{ url: 'not-a-valid-url' }, { url: 'also-invalid' }],
      })
    ).toEqual([
      { label: 'Dashboard', url: 'not-a-valid-url' },
      { label: 'Dashboard 2', url: 'also-invalid' },
    ]);
  });

  it('returns undefined for empty url, empty urls, or non-objects', () => {
    expect(parseDashboardLinks({ url: '' })).toBeUndefined();
    expect(parseDashboardLinks({ urls: [] })).toBeUndefined();
    expect(parseDashboardLinks(null)).toBeUndefined();
    expect(parseDashboardLinks('bad')).toBeUndefined();
  });
});
