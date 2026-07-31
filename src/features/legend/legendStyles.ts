import { css } from '@emotion/css';

// Shared list + row styling for the legend sections (NodeLegend / EdgeLegend /
// ClusterLegend). Each section keeps only its own glyph/swatch style and spreads
// these, so the list reset and row layout live in one place.
export function legendListStyles(): { list: string; row: string } {
  return {
    list: css({ listStyle: 'none', margin: 0, padding: 0 }),
    row: css({ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }),
  };
}

// Shared "hideable row" treatment: content fades when toggled off while the eye /
// eye-slash button stays full-strength as the restore affordance (NodeLegend kind rows,
// IngressToggle). One place to keep the fade opacity + button alignment in sync.
export function legendToggleStyles(): { dimmed: string; toggle: string } {
  return {
    dimmed: css({ opacity: 0.4 }),
    toggle: css({ marginLeft: 'auto' }),
  };
}
