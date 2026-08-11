import { css, cx } from '@emotion/css';
import { IconButton, useStyles2 } from '@grafana/ui';
import React from 'react';

import { legendListStyles, legendToggleStyles } from '../../legendStyles';

import type { IngressToggleProps } from './IngressToggle.types';

function getStyles(): {
  row: string;
  heading: string;
  dimmed: string;
  toggle: string;
} {
  const { row } = legendListStyles();
  return {
    row,
    ...legendToggleStyles(),
    // An <h4> so the "Ingress Gateway" title matches the "Node Kinds" / "Edge Types"
    // section headings (same theme h4 size/weight); margin reset so its default block
    // spacing doesn't break the flex-row alignment with the eye button.
    heading: css({ margin: 0 }),
  };
}

// Legend section toggling the whole ingress-gateway path (labeled nodes + the
// pods their services select) on/off. Label-based, so it is deliberately NOT a
// NodeLegend row — those are strictly kind-keyed. Deliberately carries NO dashed-line
// key: the ingress path is no longer the only source of dashed strokes (backend
// `relation: transport` edges dash too), so a key here would claim the gateway explains
// strokes it has nothing to do with.
export function IngressToggle({ visible, onToggle }: Readonly<IngressToggleProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);
  return (
    <div data-testid="ingress-toggle">
      <div className={styles.row}>
        <h4 className={cx(styles.heading, !visible && styles.dimmed)}>Ingress Gateway</h4>
        <IconButton
          className={styles.toggle}
          name={visible ? 'eye' : 'eye-slash'}
          size="lg"
          tooltip={`${visible ? 'Hide' : 'Show'} ingress gateway`}
          onClick={onToggle}
          data-testid="ingress-toggle-button"
        />
      </div>
    </div>
  );
}
