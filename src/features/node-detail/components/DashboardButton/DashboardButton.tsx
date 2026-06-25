import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Button, ClickOutsideWrapper, LinkButton, Menu, useStyles2 } from '@grafana/ui';
import React, { useState } from 'react';

import type { DashboardButtonProps } from './DashboardButton.types';

function getStyles(theme: GrafanaTheme2): { menuHost: string; menu: string } {
  return {
    // z-index lifts the overflowed menu above the panel body (a later DOM sibling).
    menuHost: css({ position: 'relative', display: 'inline-flex', zIndex: theme.zIndex.dropdown }),
    menu: css({
      position: 'absolute',
      top: '100%',
      left: 0,
      zIndex: theme.zIndex.dropdown,
      marginTop: 4,
      minWidth: 160,
      boxShadow: theme.shadows.z3,
    }),
  };
}

// Per-node Dashboard URL control beside the node name (alerts + detail views).
// Single link → LinkButton "Dashboard". Multiple links → "Dashboards" menu.
export function DashboardButton({ state }: Readonly<DashboardButtonProps>): React.JSX.Element | null {
  const styles = useStyles2(getStyles);
  const [menuOpen, setMenuOpen] = useState(false);

  if (state.status !== 'ready') {
    return null;
  }

  const { urls } = state;
  if (urls.length === 1) {
    const [only] = urls;
    if (only === undefined) {
      return null;
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

  const stopPointerBubble = (event: React.MouseEvent): void => {
    event.stopPropagation();
  };

  return (
    <ClickOutsideWrapper onClick={(): void => setMenuOpen(false)}>
      <div
        className={styles.menuHost}
        data-testid="node-detail-dashboards-menu"
        onMouseDown={stopPointerBubble}
      >
        <Button
          size="sm"
          variant="secondary"
          fill="outline"
          icon="external-link-alt"
          onMouseDown={stopPointerBubble}
          onClick={(event): void => {
            stopPointerBubble(event);
            setMenuOpen((open) => !open);
          }}
        >
          Dashboards
        </Button>
        {menuOpen && (
          <div className={styles.menu}>
            <Menu ariaLabel="Node dashboards">
              {urls.map((link, index) => (
                <Menu.Item
                  key={`${link.url}-${index}`}
                  label={link.label}
                  url={link.url}
                  target="_blank"
                  icon="external-link-alt"
                  testId={`node-detail-dashboard-link-${index}`}
                  onClick={(): void => setMenuOpen(false)}
                />
              ))}
            </Menu>
          </div>
        )}
      </div>
    </ClickOutsideWrapper>
  );
}
