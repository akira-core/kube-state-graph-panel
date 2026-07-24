import { css, cx } from '@emotion/css';
import { IconButton, useStyles2 } from '@grafana/ui';
import React from 'react';

import type { IngressToggleProps } from './IngressToggle.types';

function getStyles(): { row: string; heading: string; dimmed: string; toggle: string } {
  return {
    row: css({ display: 'flex', alignItems: 'center', minHeight: 24 }),
    // An <h4> so the "Ingress gateway" title matches the "Node Kinds" / "Edge Types"
    // section headings (same theme h4 size/weight); margin reset so its default block
    // spacing doesn't break the flex-row alignment with the eye button.
    heading: css({ margin: 0 }),
    // Mirrors NodeLegend's hidden-row treatment: the title fades while the eye
    // button stays full-strength as the restore affordance.
    dimmed: css({ opacity: 0.4 }),
    toggle: css({ marginLeft: 'auto' }),
  };
}

// Legend section toggling the whole ingress-gateway path (labeled nodes + the
// pods their services select) on/off. Label-based, so it is deliberately NOT a
// NodeLegend row — those are strictly kind-keyed.
export function IngressToggle({ visible, onToggle }: Readonly<IngressToggleProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);
  return (
    <div className={styles.row} data-testid="ingress-toggle">
      <h4 className={cx(styles.heading, !visible && styles.dimmed)}>Ingress gateway</h4>
      <IconButton
        className={styles.toggle}
        name={visible ? 'eye' : 'eye-slash'}
        size="lg"
        tooltip={`${visible ? 'Hide' : 'Show'} ingress gateway`}
        onClick={onToggle}
        data-testid="ingress-toggle-button"
      />
    </div>
  );
}
