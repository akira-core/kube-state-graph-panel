import { css } from '@emotion/css';
import { Button, Dropdown, LinkButton, Menu, useStyles2 } from '@grafana/ui';
import React, { useState } from 'react';

import type { DashboardButtonProps } from './DashboardButton.types';

function getStyles(): { host: string } {
  return { host: css({ display: 'inline-flex' }) };
}

// Per-node Dashboard URL control beside the node name (alerts + detail views).
// Single link → LinkButton "Dashboard". Multiple links → "Dashboards" Dropdown menu.
export function DashboardButton({ state }: Readonly<DashboardButtonProps>): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  const [open, setOpen] = useState(false);

  if (state.status !== 'ready') {
    return null;
  }

  const { urls } = state;
  if (urls.length <= 1) {
    const [only] = urls;
    if (only === undefined) {
      return null; // zero links → nothing to render.
    }
    return (
      <LinkButton
        href={only.url}
        target="_blank"
        rel="noopener noreferrer"
        icon="external-link-alt"
        size="sm"
        variant="secondary"
        fill="outline"
        tooltip="Open node dashboard"
        data-testid="node-detail-dashboard-button"
      >
        Dashboard
      </LinkButton>
    );
  }

  const menu = (
    <Menu ariaLabel="Node dashboards">
      {urls.map((link, index) => (
        <Menu.Item
          key={`${link.url}-${index}`}
          label={link.label}
          url={link.url}
          target="_blank"
          icon="external-link-alt"
          testId={`node-detail-dashboard-link-${index}`}
        />
      ))}
    </Menu>
  );

  // Dropdown portals the menu out of the panel's `overflow: hidden` box and owns
  // open/close + outside-dismiss. We track open state via `onVisibleChange` and set
  // `aria-expanded` on the trigger ourselves so the menu a11y contract does not depend
  // on a specific `@grafana/ui` version's prop injection. The wrapper's stopPropagation
  // keeps the trigger click from deselecting the node behind the panel.
  return (
    <div
      className={styles.host}
      data-testid="node-detail-dashboards-menu"
      onMouseDown={(event): void => event.stopPropagation()}
    >
      <Dropdown overlay={menu} placement="bottom-start" onVisibleChange={setOpen}>
        <Button
          size="sm"
          variant="secondary"
          fill="outline"
          icon="external-link-alt"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          Dashboards
        </Button>
      </Dropdown>
    </div>
  );
}
