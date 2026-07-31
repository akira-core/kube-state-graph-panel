import fs from 'fs';
import path from 'path';

import type cytoscape from 'cytoscape';

import { ALL_EDGE_TYPES, ALL_KINDS } from '../../panels/KsgPanel/KsgPanel.types';
import { collectIngressNodeIds } from '../../shared/graph/collectIngressNodeIds';
import { normalizeGraph } from '../graph-data/normalize';

import { computeVisibility } from './computeVisibility';

// Runs the REAL showcase dashboard fixture through the real normalize → visibility
// pipeline, so the two ingress-visibility-toggle demo scenarios are pinned by CI instead
// of relying on the manual `/d/ksg-switch-demo` sign-off recorded in tasks 7.1 / 7.2.
// Guards the fixture too: an edit that drops the ingress label or renames a node would
// silently make the demo un-toggleable, which is exactly what a reviewer cannot see.
const FIXTURE = path.join(__dirname, '../../../provisioning/dashboards/ksg-switch-demo.json');

function demoElements(): cytoscape.ElementDefinition[] {
  const dashboard = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as {
    panels: Array<{ targets: Array<{ data?: unknown }> }>;
  };
  const raw = dashboard.panels[0]?.targets[0]?.data;
  const { elements, errors } = normalizeGraph(typeof raw === 'string' ? JSON.parse(raw) : raw);
  expect(errors).toEqual([]);
  return elements;
}

const INGRESS_ONLY_NODES = [
  'service/ingress-svc',
  'pod/ingress-0',
  'prod/app/ingress',
  'prod/ctrl/Deployment/ingress',
];
const INGRESS_EDGES = ['e-ing-0', 'e-sel-6', 'e-ing-1'];

describe('showcase demo fixture — ingress double path', () => {
  const elements = demoElements();
  const ingressNodeIds = collectIngressNodeIds(elements);
  const visibility = (showIngress: boolean): ReturnType<typeof computeVisibility> =>
    computeVisibility(elements, [...ALL_KINDS], [...ALL_EDGE_TYPES], showIngress, ingressNodeIds);

  it('marks ingress-svc but NOT ingress-0 (expansion, not a label hit)', () => {
    const byId = new Map(elements.filter((e) => e.group === 'nodes').map((e) => [String(e.data.id), e.data]));
    expect((byId.get('service/ingress-svc') as cytoscape.NodeDataDefinition).labels?.role).toBe('ingress-gateway');
    expect((byId.get('pod/ingress-0') as cytoscape.NodeDataDefinition).labels?.role).toBeUndefined();
    // …yet both end up in the set, via the service-selects-pod expansion.
    expect(ingressNodeIds.has('service/ingress-svc')).toBe(true);
    expect(ingressNodeIds.has('pod/ingress-0')).toBe(true);
  });

  it('toggle OFF: the ingress path and its emptied containers disappear, direct path intact', () => {
    const { visibleNodeIds, visibleEdgeIds } = visibility(false);
    for (const id of INGRESS_ONLY_NODES) {
      expect({ id, visible: visibleNodeIds.has(id) }).toEqual({ id, visible: false });
    }
    for (const id of INGRESS_EDGES) {
      expect({ id, visible: visibleEdgeIds.has(id) }).toEqual({ id, visible: false });
    }
    // The direct route the toggle exists to isolate survives untouched.
    expect(visibleNodeIds.has('pod/gateway')).toBe(true);
    expect(visibleNodeIds.has('service/mongo-svc')).toBe(true);
    expect(visibleEdgeIds.has('e-svc-0')).toBe(true);
  });

  it('toggle ON: both paths visible', () => {
    const { visibleNodeIds, visibleEdgeIds } = visibility(true);
    for (const id of INGRESS_ONLY_NODES) {
      expect({ id, visible: visibleNodeIds.has(id) }).toEqual({ id, visible: true });
    }
    for (const id of INGRESS_EDGES) {
      expect({ id, visible: visibleEdgeIds.has(id) }).toEqual({ id, visible: true });
    }
    expect(visibleEdgeIds.has('e-svc-0')).toBe(true);
  });

  it('dashes exactly the three ingress traffic hops', () => {
    const dashed = elements
      .filter((e) => e.group === 'edges' && (e.data as cytoscape.EdgeDataDefinition).ingressPath === true)
      .map((e) => String(e.data.id))
      .sort();
    expect(dashed).toEqual([...INGRESS_EDGES].sort());
  });
});
