import { css } from '@emotion/css';
import { RadioButtonGroup, useStyles2 } from '@grafana/ui';
import React from 'react';

import type { PodParentMode } from '../../../../shared/constants/types';

import type { LayoutModeControlProps } from './LayoutModeControl.types';

const OPTIONS: Array<{ label: string; value: PodParentMode }> = [
  { label: 'Node', value: 'node' },
  { label: 'Controller', value: 'controller' },
];

function getStyles(): { root: string; label: string } {
  return {
    root: css({ display: 'flex', flexDirection: 'column', gap: 4 }),
    label: css({ fontSize: 11, fontWeight: 500, opacity: 0.85 }),
  };
}

// The pod-parent topology toggle, at the very top of the legend. Switches the
// compound grouping between cluster>node>pod and cluster>controller>pod. This is
// NOT the fcose/dagre layout-algorithm option — it changes nesting, not the engine.
export function LayoutModeControl({ mode, onChange }: Readonly<LayoutModeControlProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);
  return (
    <div className={styles.root} data-testid="layout-mode-control">
      <span className={styles.label}>Layout</span>
      <RadioButtonGroup options={OPTIONS} value={mode} onChange={onChange} size="sm" fullWidth />
    </div>
  );
}
