import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import { MISSING_VALUE_PLACEHOLDER } from '../../../../shared/constants/missingValuePlaceholder';
import { themeColors } from '../../../../shared/theme/themeColors';

import type { ChangeTimeCellProps } from './ChangeTimeCell.types';

function getStyles(theme: GrafanaTheme2): { time: string; muted: string } {
  const colors = themeColors(theme);
  return {
    // tabular-nums keeps the Current / Previous columns vertically aligned across rows
    // even when digit widths differ; nowrap so a timestamp never wraps mid-value.
    time: css({ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }),
    // Absent / unparseable time renders the MUTED "n/a" placeholder, not error-red: it
    // reads as "no value", matching the Change Report column's muted "Not found" hint.
    muted: css({ color: colors.text.secondary }),
  };
}

// One Change Report diff-timestamp cell (Current or Previous), shared by ApplicationTable
// and ContainerTable. The table pre-formats the value with formatChangeTime (so this
// cell never calls dateTimeFormat): `formatted` present → render it with the raw ISO in
// `title`; absent (missing / unparseable timestamp, or a non-ready lookup) → a muted
// "n/a" with NO title. `testId` lets each column/section be addressed in tests.
export function ChangeTimeCell({ formatted, title, testId }: Readonly<ChangeTimeCellProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);
  if (formatted === undefined) {
    return (
      <span className={styles.muted} {...(testId !== undefined ? { 'data-testid': testId } : {})}>
        {MISSING_VALUE_PLACEHOLDER}
      </span>
    );
  }
  return (
    <span
      className={styles.time}
      {...(title !== undefined ? { title } : {})}
      {...(testId !== undefined ? { 'data-testid': testId } : {})}
    >
      {formatted}
    </span>
  );
}
