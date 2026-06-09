import { createTheme } from '@grafana/data';
import cytoscape from 'cytoscape';

import { COLOR_BY_EDGE_TYPE, FALLBACK_EDGE_STYLE } from '../../../shared/constants/colorByEdgeType';
import { STATUS_COLOR } from '../../../shared/constants/colorByStatus';
import { FALLBACK_ICON_SVG, ICON_SVG_BY_KIND } from '../../../shared/constants/iconSvgByKind';
import { tintSvgToDataUri } from '../../../shared/icon/tintSvgToDataUri';

import { getStylesheet } from './getStylesheet';

type FakeData = Record<string, unknown>;
type StyleRecord = Record<string, unknown>;
type NodeFn = (ele: cytoscape.NodeSingular) => string;
type EdgeFn = (ele: cytoscape.EdgeSingular) => string;

// The background-image / line-color / line-style props are function-valued mappers
// cytoscape evaluates per element. Build a minimal element exposing `.data(key)`
// so we can invoke them directly without a live cytoscape instance.
const fakeEle = (data: FakeData): cytoscape.NodeSingular & cytoscape.EdgeSingular =>
  ({ data: (k: string) => data[k] }) as unknown as cytoscape.NodeSingular & cytoscape.EdgeSingular;

const styleFor = (selector: string): StyleRecord => {
  const sheet = getStylesheet({ theme: createTheme() }) as unknown as Array<{
    selector: string;
    style?: StyleRecord;
  }>;
  return sheet.find((s) => s.selector === selector)?.style ?? {};
};

// The icon tint colour the factory uses (theme primary text).
const iconColor = (createTheme().colors as unknown as { text: { primary: string } }).text.primary;

describe('getStylesheet', () => {
  it('returns the expected number of selectors', () => {
    const sheet = getStylesheet({ theme: createTheme() });
    const selectors = sheet.map((s) => s.selector);
    expect(selectors).toEqual(expect.arrayContaining(['node', 'node:selected', 'edge']));
  });

  it('produces different colors for light vs dark theme', () => {
    const light = getStylesheet({ theme: createTheme({ colors: { mode: 'light' } }) });
    const dark = getStylesheet({ theme: createTheme({ colors: { mode: 'dark' } }) });
    expect(JSON.stringify(light)).not.toBe(JSON.stringify(dark));
  });

  it('matches snapshot for default theme', () => {
    const sheet = getStylesheet({ theme: createTheme() });
    expect(sheet).toMatchSnapshot();
  });

  it('uses a uniform round-rectangle container for all leaf nodes (shape no longer encodes kind)', () => {
    expect(styleFor('node').shape).toBe('round-rectangle');
  });

  it('draws each kind as a theme-tinted svg data-URI background-image', () => {
    const bgFn = styleFor('node')['background-image'] as NodeFn;
    for (const [kind, svg] of Object.entries(ICON_SVG_BY_KIND)) {
      const uri = bgFn(fakeEle({ kind }));
      expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
      expect(uri).toBe(tintSvgToDataUri(svg, iconColor));
    }
    // Distinct kinds yield distinct glyphs.
    expect(bgFn(fakeEle({ kind: 'pod' }))).not.toBe(bgFn(fakeEle({ kind: 'service' })));
  });

  it('falls back to a generic icon for unknown / missing kind (never throws, never blank)', () => {
    const bgFn = styleFor('node')['background-image'] as NodeFn;
    const fallbackUri = tintSvgToDataUri(FALLBACK_ICON_SVG, iconColor);
    expect(bgFn(fakeEle({ kind: 'mystery' }))).toBe(fallbackUri);
    expect(bgFn(fakeEle({}))).toBe(fallbackUri);
  });

  it('fills the node with the icon via background-fit:contain (SVG viewBox margin keeps it off the border)', () => {
    const nodeStyle = styleFor('node');
    expect(nodeStyle['background-fit']).toBe('contain');
  });

  it('maps every backend edge type to its color and line style', () => {
    const edgeStyle = styleFor('edge');
    const colorFn = edgeStyle['line-color'] as EdgeFn;
    const lineFn = edgeStyle['line-style'] as EdgeFn;
    for (const [edgeType, style] of Object.entries(COLOR_BY_EDGE_TYPE)) {
      expect(colorFn(fakeEle({ edgeType }))).toBe(style.color);
      expect(lineFn(fakeEle({ edgeType }))).toBe(style.lineStyle);
    }
  });

  it('falls back for unknown/undefined edge type', () => {
    const colorFn = styleFor('edge')['line-color'] as EdgeFn;
    expect(colorFn(fakeEle({ edgeType: 'nope' }))).toBe(FALLBACK_EDGE_STYLE.color);
  });

  it('enlarges base leaf node to 40x40', () => {
    const nodeStyle = styleFor('node');
    expect(nodeStyle.width).toBe(40);
    expect(nodeStyle.height).toBe(40);
  });

  it('keeps cluster boxes grabbable (no events:no) so the user can drag a cluster around', () => {
    const sheet = getStylesheet({ theme: createTheme() }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const cluster = sheet.find((s) => s.selector === 'node[?isCluster]');
    // events:'no' would make the backplate non-interactive and so non-draggable;
    // it must be absent (cytoscape default 'yes') for cluster drag to work.
    expect(cluster?.style?.events).toBeUndefined();
  });

  it('declares collapsed-node and meta-edge selectors', () => {
    const sheet = getStylesheet({ theme: createTheme() }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const selectors = sheet.map((s) => s.selector);
    expect(selectors).toContain('node.cy-expand-collapse-collapsed-node');
    expect(selectors).toContain('edge.cy-expand-collapse-meta-edge');
    const metaEdge = sheet.find((s) => s.selector === 'edge.cy-expand-collapse-meta-edge');
    // The meta-edge keeps its real edge-type colour (cascades from the base `edge`
    // rule), so this rule must NOT pin a colour — it only bumps the width as the
    // collapsed-boundary cue.
    expect(metaEdge?.style?.['line-color']).toBeUndefined();
    expect(metaEdge?.style?.width).toBe(2.5);
  });

  it('borders ANY node carrying a status (kind-agnostic node[status] selectors, not a kind whitelist)', () => {
    const sheet = getStylesheet({ theme: createTheme() }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const selectors = sheet.map((s) => s.selector);
    for (const [status, color] of Object.entries(STATUS_COLOR)) {
      expect(selectors).toContain(`node[status="${status}"]`);
      const rule = sheet.find((s) => s.selector === `node[status="${status}"]`);
      expect(rule?.style?.['border-color']).toBe(color);
    }
    // No longer keyed on a pod/node/pvc whitelist — data-driven on the status attribute.
    expect(selectors.some((s) => s.includes('node[kind="pod"][status='))).toBe(false);
  });

  it('declares collapsed-container worst-status border selectors, after the per-kind status selectors', () => {
    const sheet = getStylesheet({ theme: createTheme() }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const selectors = sheet.map((s) => s.selector);
    // The per-kind status borders (pod/node/pvc) a collapsed node's worst-status tint
    // must be declared AFTER, so it overrides the node's OWN status border.
    const lastStatusIdx = Math.max(...selectors.map((s, i) => (s.includes('[status="') ? i : -1)));
    for (const [status, color] of Object.entries(STATUS_COLOR)) {
      const sel = `node[worstStatus="${status}"].cy-expand-collapse-collapsed-node`;
      expect(selectors).toContain(sel);
      expect(selectors.indexOf(sel)).toBeGreaterThan(lastStatusIdx);
      const rule = sheet.find((s) => s.selector === sel);
      expect(rule?.style?.['border-color']).toBe(color);
      expect(rule?.style?.['border-width']).toBe(3);
    }
  });

  it('tints a controller border by worst child status ONLY when collapsed (expanded stays neutral)', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: createTheme() }) as cytoscape.StylesheetStyle[],
      elements: [
        {
          group: 'nodes',
          data: { id: 'ctrl', label: 'api', kind: 'deployment', isController: true, worstStatus: 'critical' },
        },
        { group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod', parent: 'ctrl', status: 'normal' } },
        // Reference node carrying the critical colour in cytoscape's computed format.
        { group: 'nodes', data: { id: 'crit', label: 'crit', kind: 'pod', status: 'critical' } },
      ],
    });
    const ctrl = cy.getElementById('ctrl');
    const expandedBorder = ctrl.style('border-color') as string;
    const critColor = cy.getElementById('crit').style('border-color') as string;
    // A controller has no status border; expanded (:parent) → neutral, NOT the status colour.
    expect(expandedBorder).not.toBe(critColor);
    // Collapsed (extension marks the node) → border tints to the worst child status colour.
    ctrl.addClass('cy-expand-collapse-collapsed-node');
    expect(ctrl.style('border-color')).toBe(critColor);
    expect(ctrl.style('border-color')).not.toBe(expandedBorder);
    cy.destroy();
  });

  it('a collapsed k8s node borders by its worstStatus, overriding its OWN status; expanded keeps own status', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: createTheme() }) as cytoscape.StylesheetStyle[],
      elements: [
        // A normal-status k8s node hiding a critical child pod → normalize tags worstStatus 'critical'.
        { group: 'nodes', data: { id: 'n', label: 'w0', kind: 'node', status: 'normal', worstStatus: 'critical' } },
        { group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod', parent: 'n', status: 'normal' } },
        // Reference leaves carrying the normal / critical status colours.
        { group: 'nodes', data: { id: 'norm', label: 'norm', kind: 'pod', status: 'normal' } },
        { group: 'nodes', data: { id: 'crit', label: 'crit', kind: 'pod', status: 'critical' } },
      ],
    });
    const n = cy.getElementById('n');
    const normalColor = cy.getElementById('norm').style('border-color') as string;
    const critColor = cy.getElementById('crit').style('border-color') as string;
    // Expanded → its OWN status (normal), NOT the hidden child's critical colour.
    expect(n.style('border-color')).toBe(normalColor);
    expect(n.style('border-color')).not.toBe(critColor);
    // Collapsed → worstStatus (critical) overrides the own-status border.
    n.addClass('cy-expand-collapse-collapsed-node');
    expect(n.style('border-color')).toBe(critColor);
    cy.destroy();
  });

  it('styles compound parents as boxes, leaves as icon containers, and clusters without an icon (headless :parent)', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: createTheme() }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'cluster:demo', label: 'demo', isCluster: true, clusterColor: '#14b8a6' } },
        { group: 'nodes', data: { id: 'demo/node-a', label: 'node-a', kind: 'node', parent: 'cluster:demo' } },
        { group: 'nodes', data: { id: 'demo/p1', label: 'web', kind: 'pod', parent: 'demo/node-a' } },
        { group: 'nodes', data: { id: 'leaf-node', label: 'solo', kind: 'node' } },
      ],
    });
    // Every node (leaf or container) now uses the round-rectangle container shape.
    expect(cy.getElementById('demo/node-a').style('shape')).toBe('round-rectangle');
    expect(cy.getElementById('demo/p1').style('shape')).toBe('round-rectangle');
    expect(cy.getElementById('leaf-node').style('shape')).toBe('round-rectangle');
    // A leaf node carries a kind icon as background-image.
    expect(cy.getElementById('demo/p1').style('background-image')).toMatch(/^data:image\/svg\+xml,/);
    // A compound parent (K8s node boxing pods) suppresses the icon so it does not
    // fill the box behind its children.
    expect(cy.getElementById('demo/node-a').style('background-image')).toBe('none');
    // The cluster container carries NO resource icon and gets its accent backplate.
    expect(cy.getElementById('cluster:demo').style('background-image')).toBe('none');
    expect(Number(cy.getElementById('cluster:demo').style('background-opacity'))).toBeCloseTo(0.07);
    // A K8s node container is tinted with its parent cluster's accent (same colour
    // as the cluster backplate), so node and cluster read as one family.
    expect(cy.getElementById('demo/node-a').style('background-color')).toBe(
      cy.getElementById('cluster:demo').style('background-color')
    );
    // Its LABEL takes the cluster accent too (matching the box + legend swatch).
    expect(cy.getElementById('demo/node-a').style('color')).toBe(cy.getElementById('cluster:demo').style('color'));
    // A drawn leaf node (no children → not :parent) keeps the base node fill, not
    // the cluster tint, and the plain (white) base label colour.
    expect(cy.getElementById('leaf-node').style('background-color')).not.toBe(
      cy.getElementById('cluster:demo').style('background-color')
    );
    expect(cy.getElementById('leaf-node').style('color')).not.toBe(cy.getElementById('cluster:demo').style('color'));
    cy.destroy();
  });

  it('renders a storageclass group like a node container: icon-less when expanded, kind icon when collapsed/leaf', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: createTheme() }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'cluster/prod', label: 'prod', isCluster: true, clusterColor: '#14b8a6' } },
        {
          group: 'nodes',
          data: {
            id: 'prod/storageclass/fast-ssd',
            label: 'fast-ssd',
            kind: 'storageclass',
            isStorageClass: true,
            parent: 'cluster/prod',
          },
        },
        {
          group: 'nodes',
          data: { id: 'pvc/data-0', label: 'data-0', kind: 'pvc', parent: 'prod/storageclass/fast-ssd' },
        },
        // A childless storageclass models the collapsed/leaf state (it drops out of
        // node:parent → base node styling resolves its kind icon).
        { group: 'nodes', data: { id: 'sc-leaf', label: 'gp2', kind: 'storageclass', isStorageClass: true } },
      ],
    });
    const sc = cy.getElementById('prod/storageclass/fast-ssd');
    // EXPANDED (a :parent) → labelled container box, NO icon (node:parent), and tinted
    // with its parent cluster's accent — exactly like a K8s `node` container.
    expect(sc.style('background-image')).toBe('none');
    expect(sc.style('shape')).toBe('round-rectangle');
    expect(sc.style('background-color')).toBe(cy.getElementById('cluster/prod').style('background-color'));
    expect(Number(sc.style('background-opacity'))).toBeCloseTo(0.1);
    // COLLAPSED / leaf (childless) → shows its storageclass kind icon (the disk stack),
    // just like a collapsed K8s node container shows its icon.
    expect(cy.getElementById('sc-leaf').style('background-image')).toBe(
      tintSvgToDataUri(ICON_SVG_BY_KIND.storageclass, iconColor)
    );
    // The PVC nested inside still carries its own kind icon.
    expect(cy.getElementById('pvc/data-0').style('background-image')).toMatch(/^data:image\/svg\+xml,/);
    cy.destroy();
  });

  it('highlights a selected node with a crisp outline ring plus an underlay halo, leaving its border untouched', () => {
    const selectedStyle = styleFor('node:selected');
    // A distinct outline ring is drawn OUTSIDE the node (outline-* is separate from
    // border-*), offset off the border so a gap separates the two — the bold,
    // obvious selection cue.
    expect(selectedStyle['outline-color']).toBeDefined();
    expect(Number(selectedStyle['outline-width'])).toBeGreaterThan(0);
    expect(Number(selectedStyle['outline-offset'])).toBeGreaterThan(0);
    // The underlay halo is drawn UNDER the node, so the selection also glows softly
    // from behind without overriding anything painted on the node itself.
    expect(selectedStyle['underlay-color']).toBeDefined();
    expect(Number(selectedStyle['underlay-opacity'])).toBeGreaterThan(0);
    expect(Number(selectedStyle['underlay-padding'])).toBeGreaterThan(0);
    // Neither cue touches the border — that is where pod/node/pvc status colour
    // lives, and the old blue selection border used to clobber it.
    expect(selectedStyle['border-color']).toBeUndefined();
    expect(selectedStyle['border-width']).toBeUndefined();
  });

  it('keeps a critical pod’s status border when it is selected (selection no longer clobbers status)', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: createTheme() }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod', status: 'critical' } },
        { group: 'nodes', data: { id: 'p2', label: 'idle', kind: 'pod', status: 'normal' } },
      ],
    });
    const pod = cy.getElementById('p1');
    const statusBorder = pod.style('border-color') as string;
    // Sanity: the critical pod really does carry a distinct status border to begin
    // with (different from a normal pod's), so the assertion below is meaningful.
    expect(statusBorder).not.toBe(cy.getElementById('p2').style('border-color'));
    pod.select();
    // Selecting the pod leaves its status border colour intact...
    expect(pod.style('border-color')).toBe(statusBorder);
    // ...and adds a visible underlay halo.
    expect(Number(pod.style('underlay-opacity'))).toBeGreaterThan(0);
    cy.destroy();
  });

  const SWITCH_FABRIC_SELECTOR = "edge[edgeType='switch-to-switch'], edge[edgeType='node-to-switch']";

  it('routes switch↔switch and node→switch orthogonally (taxi); other edges stay bezier (direct)', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: createTheme() }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'n1', kind: 'node' } },
        { group: 'nodes', data: { id: 'sw1', kind: 'switch' } },
        { group: 'nodes', data: { id: 'sw2', kind: 'switch' } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod' } },
        { group: 'nodes', data: { id: 'p2', kind: 'pod' } },
        { group: 'edges', data: { id: 'e_n2s', source: 'n1', target: 'sw1', edgeType: 'node-to-switch' } },
        { group: 'edges', data: { id: 'e_s2s', source: 'sw1', target: 'sw2', edgeType: 'switch-to-switch' } },
        { group: 'edges', data: { id: 'e_other', source: 'p1', target: 'p2', edgeType: 'pod-calls-pod' } },
      ],
    });
    // node→switch and switch↔switch both route orthogonally (taxi) — K8s nodes are
    // pinned one tier above the fabric in controller mode, so uplinks align with
    // inter-switch wiring.
    expect(cy.getElementById('e_n2s').style('curve-style')).toBe('taxi');
    expect(cy.getElementById('e_s2s').style('curve-style')).toBe('taxi');
    expect(cy.getElementById('e_other').style('curve-style')).toBe('bezier');
    cy.destroy();
  });

  it('keeps the fabric selector to routing only, so colour/line-style are preserved from the base edge rule', () => {
    const sheet = getStylesheet({ theme: createTheme() }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const switchSel = sheet.find((s) => s.selector === SWITCH_FABRIC_SELECTOR);
    expect(switchSel?.style?.['curve-style']).toBe('taxi');
    expect(switchSel?.style?.['taxi-direction']).toBe('vertical');
    // The selector must NOT redefine colour or line-style — those cascade from the
    // base `edge` rule so switch-fabric edges keep their respective styling.
    expect(switchSel?.style?.['line-color']).toBeUndefined();
    expect(switchSel?.style?.['line-style']).toBeUndefined();
    // Declared after the base `edge` rule so its curve-style wins.
    const selectors = sheet.map((s) => s.selector);
    expect(selectors.indexOf(SWITCH_FABRIC_SELECTOR)).toBeGreaterThan(selectors.indexOf('edge'));
  });
});
