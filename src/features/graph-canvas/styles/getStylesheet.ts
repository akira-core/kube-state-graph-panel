import type { GrafanaTheme2 } from '@grafana/data';
import type cytoscape from 'cytoscape';

import { EDGE_STYLE_BY_TYPE, FALLBACK_EDGE_STYLE, type EdgeStyle } from '../../../shared/constants/colorByEdgeType';
import { STATUS_BORDER_KINDS, STATUS_COLOR } from '../../../shared/constants/colorByStatus';
import { iconSvgForKind } from '../../../shared/constants/iconSvgByKind';
import type { EdgeType, NodeKind } from '../../../shared/constants/types';
import { tintSvgToDataUri } from '../../../shared/icon/tintSvgToDataUri';
import type { CyStylesheet } from '../hooks/useCytoscape';

export interface GetStylesheetInput {
  theme: GrafanaTheme2;
  colorMap?: Record<string, EdgeStyle>;
}

const NODE_SIZE = 40;

// Per-node icon as a theme-tinted data-URI. Clusters carry no resource icon (the
// node[?isCluster] selector overrides background-image to 'none'); every other
// node resolves its kind icon, unknown kinds included (fallback glyph).
function resolveIconUri(kind: string | undefined, iconColor: string): string {
  return tintSvgToDataUri(iconSvgForKind(kind), iconColor);
}

function resolveEdgeStyle(edgeType: string | undefined, map: Record<string, EdgeStyle>): EdgeStyle {
  if (edgeType !== undefined && edgeType in map) {
    const style = map[edgeType];
    if (style !== undefined) {
      return style;
    }
  }
  return FALLBACK_EDGE_STYLE;
}

export function getStylesheet({
  theme,
  // Master map covers all wire edge types (incl. pod-runs-on-node) so the
  // stylesheet can colour the service-mode pod→node edge; resolving a type with
  // no edges in the current view is harmless.
  colorMap = EDGE_STYLE_BY_TYPE,
}: GetStylesheetInput): CyStylesheet[] {
  // @grafana/data marks these subfields optional but Grafana always populates them at runtime.
  const colors = theme.colors as unknown as {
    text: { primary: string };
    background: { secondary: string };
    border: { medium: string };
    primary: { main: string };
  };
  const textColor = colors.text.primary;
  // Tint icons with the primary text colour: on the dark node fill the secondary
  // (muted) colour was too low-contrast to read the glyph. Matches the label.
  const iconColor = textColor;
  const bgColor = colors.background.secondary;
  const borderColor = colors.border.medium;
  const selectedColor = colors.primary.main;

  // Status border for managed leaf kinds (pod/node/pvc). Spread (below) between
  // the container selectors and node:selected so it overrides the neutral
  // node:parent border (a K8s node is itself a compound parent) yet still yields
  // to the selection highlight. Colours come from STATUS_COLOR (single source).
  const statusSelectors: CyStylesheet[] = Object.entries(STATUS_COLOR).map(([status, color]) => ({
    selector: STATUS_BORDER_KINDS.map((kind) => `node[kind="${kind}"][status="${status}"]`).join(', '),
    style: { 'border-color': color, 'border-width': 3, 'border-opacity': 1 },
  }));

  const stylesheet: CyStylesheet[] = [
    {
      // Leaf nodes share one neutral container shape; identity is the centered
      // kind icon (background-image), tinted per theme. `background-fit: contain`
      // scales the glyph to fill the node box; the SVG art carries its own ~17%
      // viewBox margin, so the strokes get close to but never touch the container
      // / status border. The on-canvas glyph only renders once the SVG carries an
      // XML header (see iconSvgByKind.ts) — that, not the fit mode, was why earlier
      // attempts showed the icon in the legend <img> but blank on-canvas.
      selector: 'node',
      style: {
        shape: 'round-rectangle',
        'background-color': bgColor,
        'background-image': ((ele: cytoscape.NodeSingular): string =>
          resolveIconUri(ele.data('kind') as NodeKind | undefined, iconColor)) as unknown as string,
        'background-fit': 'contain',
        'background-clip': 'none',
        'background-image-opacity': 1,
        'border-color': borderColor,
        'border-width': 1.5,
        label: 'data(label)',
        color: textColor,
        'font-size': 11,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 4,
        width: NODE_SIZE,
        height: NODE_SIZE,
      },
    },
    {
      // Any compound parent (a node that has children — e.g. a K8s node boxing
      // its pods) renders as a neutral, labelled container. cytoscape's native
      // :parent meta-selector means the panel needs no data flag for this, and a
      // childless node still falls through to its kind shape. Real node
      // containers stay interactive (hover/tap) — only clusters opt out below.
      selector: 'node:parent',
      style: {
        shape: 'round-rectangle',
        'background-color': borderColor,
        'background-opacity': 0.05,
        // Compound containers (e.g. a K8s node boxing its pods) carry NO resource
        // icon — a `contain`-fitted glyph would fill the whole box behind its
        // children. The box stays a labelled backplate. (A small corner badge is
        // a deferred nicety.)
        'background-image': 'none',
        'border-color': borderColor,
        'border-width': 1,
        'border-opacity': 0.6,
        label: 'data(label)',
        color: textColor,
        'font-size': 11,
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -3,
        padding: '14px',
      },
    },
    {
      // Compound (cluster) container nodes — see normalize.ts. Each carries its
      // own accent colour in data(clusterColor), so the box is a translucent,
      // labelled backplate. events:'no' keeps it purely decorative (no hover/tap).
      // Declared after node:parent so its accent colour wins for cluster boxes.
      selector: 'node[?isCluster]',
      style: {
        shape: 'round-rectangle',
        // Cluster boxes are pure grouping backplates — no resource icon (the base
        // mapper would otherwise paint the fallback glyph here).
        'background-image': 'none',
        'background-color': 'data(clusterColor)',
        'background-opacity': 0.07,
        'border-color': 'data(clusterColor)',
        'border-width': 1.5,
        'border-opacity': 0.5,
        label: 'data(label)',
        color: 'data(clusterColor)',
        'font-size': 12,
        'font-weight': 600,
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -4,
        padding: '18px',
        events: 'no',
      },
    },
    {
      // Collapsed compound node (cluster or k8s node). Heavier border signals it
      // can be expanded; the +/- cue is drawn by the extension independently.
      selector: 'node.cy-expand-collapse-collapsed-node',
      style: {
        'border-width': 3,
        'border-opacity': 0.9,
      },
    },
    {
      // A COLLAPSED cluster becomes clickable (expand / show detail). Declared
      // after node[?isCluster] (events:'no') so this events:'yes' wins. Expanded
      // clusters stay decorative.
      selector: 'node[?isCluster].cy-expand-collapse-collapsed-node',
      style: {
        events: 'yes',
      },
    },
    ...statusSelectors,
    {
      // Declared AFTER the container selectors so the selection highlight wins
      // for selected leaf nodes AND node containers (clusters are events:'no').
      selector: 'node:selected',
      style: {
        'border-color': selectedColor,
        'border-width': 3,
      },
    },
    {
      selector: 'edge',
      style: {
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        width: 1.5,
        'line-color': ((ele: cytoscape.EdgeSingular): string =>
          resolveEdgeStyle(ele.data('edgeType') as EdgeType | undefined, colorMap).color) as unknown as string,
        'target-arrow-color': ((ele: cytoscape.EdgeSingular): string =>
          resolveEdgeStyle(ele.data('edgeType') as EdgeType | undefined, colorMap).color) as unknown as string,
        'line-style': ((ele: cytoscape.EdgeSingular): cytoscape.Css.LineStyle =>
          resolveEdgeStyle(ele.data('edgeType') as EdgeType | undefined, colorMap)
            .lineStyle) as unknown as cytoscape.Css.LineStyle,
      },
    },
    {
      // Switch↔switch fabric edges route orthogonally (taxi) so the many edges
      // converging on one switch share clean right-angle channels instead of
      // overlapping béziers. node→switch is intentionally EXCLUDED — a k8s node
      // links to its switch as a direct (bézier) uplink, kept visually separate
      // from the switch fabric (own indigo colour). Declared AFTER the base `edge`
      // selector so its curve-style wins; sets only routing props, leaving
      // line-color / arrow from the `edge` selector intact.
      selector: "edge[edgeType='switch-to-switch']",
      style: {
        'curve-style': 'taxi',
        'taxi-direction': 'vertical',
        'taxi-turn': '50%',
        'taxi-turn-min-distance': 5,
      } as unknown as cytoscape.Css.Edge,
    },
    {
      // Aggregated edge synthesised by expand-collapse when a container is
      // collapsed. Neutral colour + slightly heavier; exempt from edge-type
      // filtering (visibility follows endpoints only — see useElementFilter).
      selector: 'edge.cy-expand-collapse-meta-edge',
      style: {
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        width: 2.5,
        'line-color': FALLBACK_EDGE_STYLE.color,
        'target-arrow-color': FALLBACK_EDGE_STYLE.color,
        'line-style': 'solid',
      },
    },
  ];

  return stylesheet;
}
