import { createTheme } from '@grafana/data';

import { getStylesheet } from './getStylesheet';

describe('getStylesheet', () => {
  it('returns the expected number of selectors', () => {
    const sheet = getStylesheet({ theme: createTheme() });
    const selectors = sheet.map((s) => s.selector);
    expect(selectors).toEqual(expect.arrayContaining(['node', 'node:selected', 'edge']));
  });

  it('produces different colors for light vs dark theme', () => {
    const light = getStylesheet({ theme: createTheme({ colors: { mode: 'light' } }) });
    const dark = getStylesheet({ theme: createTheme({ colors: { mode: 'dark' } }) });
    expect(JSON.stringify(light)).not.toBe(JSON.stringify(dark));
  });

  it('matches snapshot for default theme', () => {
    const sheet = getStylesheet({ theme: createTheme() });
    expect(sheet).toMatchSnapshot();
  });
});
