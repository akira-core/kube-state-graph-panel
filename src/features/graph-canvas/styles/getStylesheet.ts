import type { GrafanaTheme2 } from '@grafana/data';
import type cytoscape from 'cytoscape';

import { COLOR_BY_EDGE_TYPE, FALLBACK_EDGE_STYLE, type EdgeStyle } from '../../../shared/constants/colorByEdgeType';
import { FALLBACK_SHAPE, SHAPE_BY_KIND, type CytoscapeNodeShape } from '../../../shared/constants/shapeByKind';
import type { EdgeType, NodeKind } from '../../../shared/constants/types';
import type { CyStylesheet } from '../hooks/useCytoscape';

export interface GetStylesheetInput {
  theme: GrafanaTheme2;
  shapeMap?: Record<string, CytoscapeNodeShape>;
  colorMap?: Record<string, EdgeStyle>;
}

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
  colorMap = COLOR_BY_EDGE_TYPE,
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
        width: 36,
        height: 36,
      },
    },
    {
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
  ];

  return stylesheet;
}
