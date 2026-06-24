import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import { resultTypeColor } from '../../../../shared/constants/colorByResultType';
import { themeColors } from '../../../../shared/theme/themeColors';

import type { ChangeTypeCellProps } from './ChangeTypeCell.types';

const PLACEHOLDER = '—';

function getStyles(theme: GrafanaTheme2): { type: string; muted: string } {
  const colors = themeColors(theme);
  return {
    // The result_type renders as COLOURED TEXT (no badge background) — the semantic
    // colour is applied inline per value via resultTypeColor. uppercase + nowrap so the
    // short enum reads as a status token and never wraps mid-word; the displayed text is
    // upper-cased while resultTypeColor matches case-insensitively, so a lower-case
    // backend value still shows upper-case in its right colour.
    type: css({ fontWeight: 600, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.3 }),
    // Absent / empty result_type renders a MUTED em-dash, matching the Current / Previous
    // time cells' "no value" treatment (not error-red).
    muted: css({ color: colors.text.secondary }),
  };
}

// One Change Type cell for the Containers table. Renders the code-change `result_type`
// as coloured text (resultTypeColor: known enum value → semantic colour, unknown value →
// neutral grey, still shown so an upstream enum addition never silently disappears), or a
// muted "—" when the lookup carries no result_type (missing / empty / non-ready). Mirrors
// ChangeTimeCell's dumb-presentational shape — the table decides the value, the cell only
// renders it.
export function ChangeTypeCell({ type, testId }: Readonly<ChangeTypeCellProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);
  if (type === undefined || type.length === 0) {
    return (
      <span className={styles.muted} {...(testId !== undefined ? { 'data-testid': testId } : {})}>
        {PLACEHOLDER}
      </span>
    );
  }
  return (
    <span
      className={styles.type}
      style={{ color: resultTypeColor(type) }}
      {...(testId !== undefined ? { 'data-testid': testId } : {})}
    >
      {type}
    </span>
  );
}
