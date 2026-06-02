import type { GrafanaTheme2 } from '@grafana/data';
import type cytoscape from 'cytoscape';

import { EDGE_STYLE_BY_TYPE, FALLBACK_EDGE_STYLE, type EdgeStyle } from '../../../shared/constants/colorByEdgeType';
import { STATUS_BORDER_KINDS, STATUS_COLOR } from '../../../shared/constants/colorByStatus';
import { FALLBACK_SHAPE, SHAPE_BY_KIND, type CytoscapeNodeShape } from '../../../shared/constants/shapeByKind';
import type { EdgeType, NodeKind } from '../../../shared/constants/types';
import type { CyStylesheet } from '../hooks/useCytoscape';

export interface GetStylesheetInput {
  theme: GrafanaTheme2;
  shapeMap?: Record<string, CytoscapeNodeShape>;
  colorMap?: Record<string, EdgeStyle>;
}

const NODE_SIZE = 40;
const HEXAGON_ASPECT = 2 / Math.sqrt(3);

function resolveShape(kind: string | undefined, map: Record<string, CytoscapeNodeShape>): CytoscapeNodeShape {
  if (kind !== undefined && kind in map) {
    const shape = map[kind];
    if (shape !== undefined) {
      return shape;
    }
  }
  return FALLBACK_SHAPE;
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
  shapeMap = SHAPE_BY_KIND,
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

  // Derive hexagon-shaped kinds from the single-source shapeMap so this follows
  // any future shape reassignment. They keep the base height and only widen, so
  // width:height settles at 2:√3 — a regular hexagon. Leaf-only selector; cluster
  // / node:parent containers override `shape` to round-rectangle, so the width
  // bump never reaches a compound box.
  const hexagonKinds = Object.entries(shapeMap)
    .filter(([, shape]) => shape === 'hexagon')
    .map(([kind]) => kind);
  const hexagonSelectors: CyStylesheet[] =
    hexagonKinds.length > 0
      ? [
          {
            selector: hexagonKinds.map((kind) => `node[kind="${kind}"]`).join(', '),
            style: { width: NODE_SIZE * HEXAGON_ASPECT },
          },
        ]
      : [];

  const stylesheet: CyStylesheet[] = [
    {
      selector: 'node',
      style: {
        shape: ((ele: cytoscape.NodeSingular): CytoscapeNodeShape =>
          resolveShape(ele.data('kind') as NodeKind | undefined, shapeMap)) as unknown as cytoscape.Css.NodeShape,
        'background-color': bgColor,
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
    ...hexagonSelectors,
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
