import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { type CellProps, type Column, InteractiveTable, useStyles2 } from '@grafana/ui';
import React, { useMemo } from 'react';

import { themeColors } from '../../../../shared/theme/themeColors';
import type { DetailLookup } from '../../hooks/useNodeDetailUrls';
import { ChangeReportCell } from '../ChangeReportCell';

import type { ContainerTableProps } from './ContainerTable.types';

interface ContainerRow {
  name: string;
  image: string;
}

function getStyles(theme: GrafanaTheme2): { name: string; image: string; tableWrap: string } {
  const colors = themeColors(theme);
  return {
    // A plain-string header (required for Grafana 11.4, whose InteractiveTable types
    // `Column.header` as `string`, not a renderer) can't carry a className, so the
    // "Change Report" header — always the last column — is right-aligned by targeting
    // its <th> from the table wrapper. Keeps the label on the same right edge the
    // anchors pin to, lined up with the Application section's, even when a hint widens
    // this column leftward.
    tableWrap: css({ '& th:last-child': { textAlign: 'right' } }),
    // nowrap: a container name is an identifier. disableGrow shrinks this column to
    // its min-content width, and without nowrap the browser breaks the name at its
    // hyphens (e.g. `nats-server-config-reloader`), wrapping it across lines. Pin it
    // to one line so it stays readable; the Image column (break-all) still soaks up
    // the remaining width.
    name: css({ fontWeight: 600, whiteSpace: 'nowrap' }),
    // break-all instead of ellipsis: registry/repo@tag strings have no spaces, so
    // an unwrapped image would stretch its column and push the table past the
    // panel edge; wrapping keeps the columns aligned and the full image readable.
    image: css({
      color: colors.text.secondary,
      fontFamily: theme.typography.fontFamilyMonospace,
      fontSize: theme.typography.bodySmall.fontSize,
      wordBreak: 'break-all',
    }),
  };
}

// Stable id per row so InteractiveTable (react-table) does not thrash; the index
// suffix mirrors AlertTable's convention (duplicate name+image pairs cannot
// collide as React keys).
function rowId(row: ContainerRow, index: number): string {
  return `${row.name}/${row.image}-${String(index)}`;
}

// Per-row Change Report state from the shared code_changes lookup: phase 'loading'
// → spinner on every row; 'settled' → the row's resolved entry if the map has this
// container (Object.hasOwn, NOT a `??` fallback, so a container literally named
// `toString` / `constructor` can't pick up an inherited Object.prototype member),
// else the "No change report" hint.
function rowLookup(lookups: ContainerTableProps['lookups'], name: string): DetailLookup {
  if (lookups.phase === 'loading') {
    return { status: 'loading' };
  }
  if (Object.hasOwn(lookups.byName, name)) {
    return lookups.byName[name] ?? { status: 'unavailable' };
  }
  return { status: 'unavailable' };
}

// The containers table: a headered InteractiveTable (same component and column
// layout as the Alerts table — D8) with Name / Image / Change Report columns, one
// row per container. Each Change Report is EAGER-prefetched (the shared code_changes
// map resolves when the panel opens); the shared ChangeReportCell renders the row's
// DetailLookup as a Spinner / `<a href>` anchor / muted "No change report" hint. The
// header and rows always render; each row's state is independent.
export function ContainerTable({ containers, lookups }: Readonly<ContainerTableProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);

  // columns + data must be memoized (InteractiveTable / react-table requirement).
  const data = useMemo<ContainerRow[]>(() => containers.map((c) => ({ name: c.name, image: c.image })), [containers]);

  const columns = useMemo<Array<Column<ContainerRow>>>(
    () => [
      {
        id: 'name',
        header: 'Name',
        // disableGrow: the Image column soaks up the remaining width, keeping the
        // Change Report column hugging the right edge (aligned with the
        // Application section's).
        disableGrow: true,
        cell: ({ row }: CellProps<ContainerRow>) => <span className={styles.name}>{row.original.name}</span>,
      },
      {
        id: 'image',
        header: 'Image',
        cell: ({ row }: CellProps<ContainerRow>) => <span className={styles.image}>{row.original.image}</span>,
      },
      {
        id: 'url',
        header: 'Change Report',
        disableGrow: true,
        cell: ({ row }: CellProps<ContainerRow>) => (
          <ChangeReportCell state={rowLookup(lookups, row.original.name)} idPrefix="container" />
        ),
      },
    ],
    [styles, lookups]
  );

  return (
    <div data-testid="container-table" className={styles.tableWrap}>
      <InteractiveTable columns={columns} data={data} getRowId={rowId} />
    </div>
  );
}
