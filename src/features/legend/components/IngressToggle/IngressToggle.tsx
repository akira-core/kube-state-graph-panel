import { css, cx } from '@emotion/css';
import { IconButton, useStyles2 } from '@grafana/ui';
import React from 'react';

import { INGRESS_DASH_COLOR, INGRESS_DASH_PATTERN } from '../../../../shared/constants/colorByEdgeType';
import { legendListStyles, legendToggleStyles } from '../../legendStyles';
import { EdgeGlyph } from '../EdgeGlyph';

import type { IngressToggleProps } from './IngressToggle.types';

function getStyles(): {
  row: string;
  heading: string;
  dimmed: string;
  toggle: string;
  sample: string;
  sampleLabel: string;
} {
  const { row } = legendListStyles();
  return {
    row,
    ...legendToggleStyles(),
    // An <h4> so the "Ingress Gateway" title matches the "Node Kinds" / "Edge Types"
    // section headings (same theme h4 size/weight); margin reset so its default block
    // spacing doesn't break the flex-row alignment with the eye button.
    heading: css({ margin: 0 }),
    // Small dashed-line key so the toggle also explains the dashed strokes it produces on
    // canvas — EdgeLegend has no row for them (the ingress hops reuse the pod↔service types
    // that EdgeLegend deliberately omits), so without this the dashing is unexplained.
    sample: css({ display: 'inline-flex', width: 20, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }),
    sampleLabel: css({ fontSize: 11, opacity: 0.7 }),
  };
}

// Legend section toggling the whole ingress-gateway path (labeled nodes + the
// pods their services select) on/off. Label-based, so it is deliberately NOT a
// NodeLegend row — those are strictly kind-keyed.
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
      <div className={styles.row}>
        <span className={styles.sample}>
          <EdgeGlyph
            color={INGRESS_DASH_COLOR}
            lineStyle="dashed"
            dashPattern={INGRESS_DASH_PATTERN.join(' ')}
          />
        </span>
        <span className={styles.sampleLabel}>dashed = via gateway</span>
      </div>
    </div>
  );
}
