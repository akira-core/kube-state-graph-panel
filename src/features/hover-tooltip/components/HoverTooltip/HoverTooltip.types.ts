import type cytoscape from 'cytoscape';

export interface HoverTooltipProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  // Gates listener binding until the cytoscape instance exists — see useCytoscape.
  // Without it the hover listeners are attached while cyRef is still null and
  // never re-attach, so the tooltip silently never appears.
  ready?: boolean;
}
