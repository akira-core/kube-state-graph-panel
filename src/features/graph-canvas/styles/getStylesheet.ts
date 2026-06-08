import type { GrafanaTheme2 } from '@grafana/data';
import type cytoscape from 'cytoscape';

import { EDGE_STYLE_BY_TYPE, FALLBACK_EDGE_STYLE, type EdgeStyle } from '../../../shared/constants/colorByEdgeType';
import { STATUS_BORDER_KINDS, STATUS_COLOR } from '../../../shared/constants/colorByStatus';
import { iconSvgForKind } from '../../../shared/constants/iconSvgByKind';
import type { EdgeType, NodeKind } from '../../../shared/constants/types';
import { tintSvgToDataUri } from '../../../shared/icon/tintSvgToDataUri';
import { themeColors } from '../../../shared/theme/themeColors';
import type { CyStylesheet } from '../hooks/useCytoscape';

export interface GetStylesheetInput {
  theme: GrafanaTheme2;
  colorMap?: Record<string, EdgeStyle>;
}

const NODE_SIZE = 40;

// Class added to elements OUTSIDE the focus set when a node is selected, so the
// selection stands out by dimming everything else (a colour-only highlight reads
// too weakly on a dense graph). Applied/removed imperatively by GraphCanvas; the
// opacity rules live in the stylesheet below.
export const FADED_CLASS = 'ksg-faded';

// Per-node icon as a theme-tinted data-URI. Clusters carry no resource icon (the
// node[?isCluster] selector overrides background-image to 'none'); every other
// node resolves its kind icon, unknown kinds included (fallback glyph).
function resolveIconUri(kind: string | undefined, iconColor: string): string {
  return tintSvgToDataUri(iconSvgForKind(kind), iconColor);
}

// Colour for a node that is a compound container (a K8s node boxing pods): its
// parent cluster's accent, falling back to `fallback` when it has no cluster
// parent. Used for BOTH the box tint and the container label, so node and cluster
// read as one family. A COLLAPSED node is no longer `:parent` (expand-collapse
// removes its children), so it stops matching node:parent and reverts to the base
// node styling — exactly the "white label once collapsed" behaviour we want.
function resolveParentClusterColor(ele: cytoscape.NodeSingular, fallback: string): string {
  const parentColor = ele.parent().data('clusterColor') as unknown;
  return typeof parentColor === 'string' ? parentColor : fallback;
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
  // stylesheet can colour the controller-mode pod→node edge; resolving a type with
  // no edges in the current view is harmless.
  colorMap = EDGE_STYLE_BY_TYPE,
}: GetStylesheetInput): CyStylesheet[] {
  const colors = themeColors(theme);
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

  // A COLLAPSED container (controller / k8s node) borders in the worst STATUS it HIDES
  // among its descendants (data.worstStatus, aggregated in normalize: a controller's
  // worst child-pod status; a k8s node's worst of its own + child statuses). Gated on
  // the collapsed-node class so an EXPANDED container keeps its neutral / own-status
  // border; spread (below) AFTER statusSelectors so a collapsed node's worst-child
  // status overrides its OWN status border. Scope (controller + node only) is enforced
  // in normalize — only those nodes carry data.worstStatus.
  const collapsedContainerStatusSelectors: CyStylesheet[] = Object.entries(STATUS_COLOR).map(([status, color]) => ({
    selector: `node[worstStatus="${status}"].cy-expand-collapse-collapsed-node`,
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
        // Tint a K8s node container with its parent cluster's accent so node and
        // cluster read as one family (the on-canvas counterpart of the "Nodes"
        // legend swatch, which takes the same colour). Falls back to the neutral
        // border colour when the node has no cluster parent. Cluster containers
        // also match node:parent but their parent() is empty (top-level) → neutral
        // here, then node[?isCluster] below overrides with their own colour.
        'background-color': ((ele: cytoscape.NodeSingular): string =>
          resolveParentClusterColor(ele, borderColor)) as unknown as string,
        'background-opacity': 0.1,
        // Compound containers (e.g. a K8s node boxing its pods) carry NO resource
        // icon — a `contain`-fitted glyph would fill the whole box behind its
        // children. The box stays a labelled backplate. (A small corner badge is
        // a deferred nicety.)
        'background-image': 'none',
        'border-color': borderColor,
        'border-width': 1,
        'border-opacity': 0.6,
        label: 'data(label)',
        // Label takes the cluster accent too, matching the box tint and the "Nodes"
        // swatch. A collapsed node drops out of node:parent and reverts to the base
        // node's plain text colour (white) — the requested expanded-vs-collapsed
        // distinction falls straight out of the selector.
        color: ((ele: cytoscape.NodeSingular): string =>
          resolveParentClusterColor(ele, textColor)) as unknown as string,
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
    // Declared AFTER statusSelectors: a collapsed k8s node's worst-child status must
    // override its OWN status border; a controller has no status border so this is its
    // only tint.
    ...collapsedContainerStatusSelectors,
    {
      // Selection highlight = a crisp outline RING + a soft underlay halo, NOT a
      // border override. A blue selection border used to clobber the status border
      // (statusSelectors above), so clicking an unhealthy pod hid the very colour
      // signalling its health. `outline-*` draws a separate ring OUTSIDE the node
      // (offset off the border, so a gap separates the two) and `underlay-*` glows
      // from behind — both leave border + background + icon untouched, so the
      // status colour survives while the selection reads boldly. Combined with the
      // focus dimming (FADED_CLASS) it stands out clearly. Declared AFTER the
      // container/status selectors so it applies to selected leaf nodes AND node
      // containers (clusters are events:'no' and cannot be selected).
      selector: 'node:selected',
      style: {
        'outline-color': selectedColor,
        'outline-width': 3,
        'outline-offset': 3,
        'underlay-color': selectedColor,
        'underlay-opacity': 0.35,
        'underlay-padding': 6,
      },
    },
    {
      // Focus dimming: a node OUTSIDE the selected node's neighbourhood/ancestry
      // fades back so the selection (and what it connects to) reads clearly.
      selector: `node.${FADED_CLASS}`,
      style: { opacity: 0.2 },
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
      // Switch↔switch and node→switch fabric edges route orthogonally (taxi) so
      // the many edges converging on one switch share clean right-angle channels
      // instead of overlapping béziers. node→switch shares the same routing because
      // K8s nodes are now pinned one tier above the switch fabric (controller mode),
      // so their uplinks are parallel vertical segments — taxi keeps them aligned
      // with the inter-switch wiring. Declared AFTER the base `edge` selector so
      // its curve-style wins; sets only routing props, leaving line-color / arrow
      // from the `edge` selector intact.
      selector: "edge[edgeType='switch-to-switch'], edge[edgeType='node-to-switch']",
      style: {
        'curve-style': 'taxi',
        'taxi-direction': 'vertical',
        'taxi-turn': '50%',
        'taxi-turn-min-distance': 5,
      } as unknown as cytoscape.Css.Edge,
    },
    {
      // Focus dimming for edges (see node.FADED_CLASS). Slightly lower than nodes
      // so faded connections recede further than faded glyphs.
      selector: `edge.${FADED_CLASS}`,
      style: { opacity: 0.12 },
    },
    {
      // Boundary edge re-pointed to a collapsed container by expand-collapse. The
      // extension preserves the original edge's `data.edgeType`, so colour +
      // arrow + line-style cascade from the base `edge` rule above — the edge KEEPS
      // its real relationship colour. This rule only bumps the width (and forces a
      // direct bezier, since taxi routing makes no sense pointing at a collapsed
      // box) so "this crosses into a collapsed container" still reads at a glance.
      // Exempt from edge-type filtering (visibility follows endpoints only — see
      // useElementFilter).
      selector: 'edge.cy-expand-collapse-meta-edge',
      style: {
        'curve-style': 'bezier',
        width: 2.5,
      },
    },
  ];

  return stylesheet;
}
