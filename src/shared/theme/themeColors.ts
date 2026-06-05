import type { GrafanaTheme2 } from '@grafana/data';

// The subset of Grafana theme colours this panel reads. The Grafana-13-typed
// `@grafana/data` marks these subfields optional (`string | undefined`), so under
// `strict` every consumer otherwise re-casts `theme.colors as unknown as {…}` with
// its own inline shape. This is the single place that load-bearing cast lives;
// callers do `themeColors(theme).border.weak` instead of re-declaring it.
export interface ThemeColors {
  text: { primary: string; secondary: string };
  background: { secondary: string };
  border: { weak: string; medium: string };
  primary: { main: string };
}

export function themeColors(theme: GrafanaTheme2): ThemeColors {
  return theme.colors as unknown as ThemeColors;
}
