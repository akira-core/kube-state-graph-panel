import type cytoscape from 'cytoscape';

export interface HoverTooltipProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
}

export const HOVER_LABEL_WHITELIST: readonly string[] = [
  'app',
  'version',
  'app.kubernetes.io/name',
  'app.kubernetes.io/instance',
];
