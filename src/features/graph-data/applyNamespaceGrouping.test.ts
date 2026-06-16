import type cytoscape from 'cytoscape';

import { colorForNamespace } from '../../shared/constants/namespacePalette';

import { applyNamespaceGrouping } from './applyNamespaceGrouping';

type El = cytoscape.ElementDefinition;

// data accessor (ElementDefinition.data is the Node|Edge union; node-specific fields
// like parent / isNamespace need a cast, matching the codebase convention).
const D = (el: El): Record<string, unknown> => el.data;

const clusterNode = (id: string, name: string): El => ({
  group: 'nodes',
  selectable: false,
  data: { id, label: name, isCluster: true, cluster: name, clusterColor: '#3f7fbf' },
});
const controllerNode = (id: string, label: string, parent: string, namespace: string): El => ({
  group: 'nodes',
  data: { id, label, kind: 'deployment', isController: true, namespace, parent },
});
const serviceNode = (id: string, label: string, parent: string, namespace: string): El => ({
  group: 'nodes',
  data: { id, label, kind: 'service', namespace, parent },
});
const podNode = (id: string, parent: string): El => ({ group: 'nodes', data: { id, label: id, kind: 'pod', parent } });
const scBoxNode = (id: string, label: string, parent: string): El => ({
  group: 'nodes',
  data: { id, label, kind: 'storageclass', isStorageClass: true, parent },
});
const pvcNode = (id: string, parent: string, namespace: string): El => ({
  group: 'nodes',
  data: { id, label: id, kind: 'pvc', namespace, parent },
});

const elById = (out: El[]): Map<string, El> =>
  new Map(out.filter((e) => e.group === 'nodes').map((e) => [D(e).id as string, e]));
const nsBoxesOf = (out: El[]): El[] => out.filter((e) => e.group === 'nodes' && D(e).isNamespace === true);

describe('applyNamespaceGrouping', () => {
  describe('node mode (no-op)', () => {
    it('returns a fresh, semantically-equal array with no namespace boxes / colours', () => {
      const els = [
        clusterNode('cluster/prod', 'prod'),
        controllerNode('ctrl/api', 'api', 'cluster/prod', 'shop'),
        podNode('pod/1', 'ctrl/api'),
        serviceNode('svc/pay', 'pay', 'cluster/prod', 'shop'),
        scBoxNode('sc/gp2', 'gp2', 'cluster/prod'),
        pvcNode('pvc/a', 'sc/gp2', 'shop'),
      ];
      const out = applyNamespaceGrouping(els, 'node');
      expect(nsBoxesOf(out)).toHaveLength(0);
      expect(out.some((e) => D(e).namespaceColor !== undefined)).toBe(false);
      const m = elById(out);
      expect(D(m.get('ctrl/api')!).parent).toBe('cluster/prod');
      expect(D(m.get('svc/pay')!).parent).toBe('cluster/prod');
      expect(D(m.get('pvc/a')!).parent).toBe('sc/gp2');
      expect(m.get('sc/gp2')).toBeDefined(); // not removed
      expect(out).not.toBe(els); // fresh array
      expect(out[0]).not.toBe(els[0]); // fresh elements
    });
  });

  describe('controller mode', () => {
    it('groups a controller and a service under one (cluster, namespace) box', () => {
      const els = [
        clusterNode('cluster/prod', 'prod'),
        controllerNode('ctrl/api', 'api', 'cluster/prod', 'shop'),
        podNode('pod/1', 'ctrl/api'),
        serviceNode('svc/pay', 'pay', 'cluster/prod', 'shop'),
      ];
      const out = applyNamespaceGrouping(els, 'controller');
      const boxes = nsBoxesOf(out);
      expect(boxes).toHaveLength(1);
      const box = boxes[0]!;
      const boxId = D(box).id as string;
      expect(D(box).namespace).toBe('shop');
      expect(D(box).parent).toBe('cluster/prod');
      expect(D(box).namespaceColor).toBe(colorForNamespace('shop'));
      expect(box.selectable).toBe(false);
      expect(D(box).status).toBeUndefined();
      expect(D(box).worstStatus).toBeUndefined();
      const m = elById(out);
      expect(D(m.get('ctrl/api')!).parent).toBe(boxId);
      expect(D(m.get('svc/pay')!).parent).toBe(boxId);
      expect(D(m.get('pod/1')!).parent).toBe('ctrl/api'); // pod stays under its controller
    });

    it('synthesizes its own box id (deterministic, ≠ cluster id) while reusing the real cluster id as parent', () => {
      const els = [clusterNode('cluster/prod', 'prod'), controllerNode('ctrl/api', 'api', 'cluster/prod', 'shop')];
      const a = nsBoxesOf(applyNamespaceGrouping(els, 'controller'))[0]!;
      const b = nsBoxesOf(applyNamespaceGrouping(els, 'controller'))[0]!;
      expect(D(a).id).toBe(D(b).id); // deterministic
      expect(D(a).id).not.toBe('cluster/prod'); // own id is synthesized
      expect(D(a).parent).toBe('cluster/prod'); // parent reuses the real cluster id
    });

    it('keeps same-named namespaces in different clusters as separate boxes (same colour)', () => {
      const els = [
        clusterNode('cluster/prod', 'prod'),
        clusterNode('cluster/dr', 'dr'),
        controllerNode('ctrl/prod-api', 'api', 'cluster/prod', 'shop'),
        controllerNode('ctrl/dr-api', 'api', 'cluster/dr', 'shop'),
      ];
      const boxes = nsBoxesOf(applyNamespaceGrouping(els, 'controller'));
      expect(boxes).toHaveLength(2);
      expect(boxes.map((b) => D(b).parent).sort()).toEqual(['cluster/dr', 'cluster/prod']);
      expect(new Set(boxes.map((b) => D(b).id)).size).toBe(2); // distinct ids
      for (const b of boxes) {
        expect(D(b).namespaceColor).toBe(colorForNamespace('shop'));
      }
    });

    it('splits a cross-namespace storageclass box into per-namespace sub-boxes, removing the empty original', () => {
      const els = [
        clusterNode('cluster/prod', 'prod'),
        scBoxNode('sc/gp2', 'gp2', 'cluster/prod'),
        pvcNode('pvc/a', 'sc/gp2', 'nsa'),
        pvcNode('pvc/b', 'sc/gp2', 'nsb'),
      ];
      const out = applyNamespaceGrouping(els, 'controller');
      const m = elById(out);
      expect(m.get('sc/gp2')).toBeUndefined(); // fully split → removed
      expect(nsBoxesOf(out)).toHaveLength(2);

      const subA = m.get(D(m.get('pvc/a')!).parent as string)!;
      const subB = m.get(D(m.get('pvc/b')!).parent as string)!;
      expect(D(subA).isStorageClass).toBe(true);
      expect(D(subA).kind).toBe('storageclass');
      expect(D(subA).label).toBe('gp2');
      expect(D(subA).status).toBeUndefined();
      expect(D(subB).label).toBe('gp2');
      expect(D(subA).id).not.toBe(D(subB).id); // distinct per namespace

      const nsA = m.get(D(subA).parent as string)!;
      const nsB = m.get(D(subB).parent as string)!;
      expect(D(nsA).isNamespace).toBe(true);
      expect(D(nsA).namespace).toBe('nsa');
      expect(D(nsB).namespace).toBe('nsb');
      expect(D(nsA).parent).toBe('cluster/prod');
    });

    it('re-parents a storageclass-less pvc directly under its namespace box', () => {
      const els = [clusterNode('cluster/prod', 'prod'), pvcNode('pvc/x', 'cluster/prod', 'shop')];
      const out = applyNamespaceGrouping(els, 'controller');
      const m = elById(out);
      const boxId = D(nsBoxesOf(out)[0]!).id as string;
      expect(D(m.get('pvc/x')!).parent).toBe(boxId);
      expect(out.some((e) => D(e).isStorageClass === true)).toBe(false); // no sub-box
    });

    it('keeps the original storageclass box when one of its pvcs has no namespace', () => {
      const els = [
        clusterNode('cluster/prod', 'prod'),
        scBoxNode('sc/gp2', 'gp2', 'cluster/prod'),
        pvcNode('pvc/a', 'sc/gp2', 'shop'),
        { group: 'nodes', data: { id: 'pvc/b', label: 'pvc/b', kind: 'pvc', parent: 'sc/gp2' } } as El, // no namespace
      ];
      const out = applyNamespaceGrouping(els, 'controller');
      const m = elById(out);
      expect(m.get('sc/gp2')).toBeDefined(); // not all pvcs moved → kept
      expect(D(m.get('pvc/b')!).parent).toBe('sc/gp2'); // namespace-less pvc stays
      expect(D(m.get('pvc/a')!).parent).not.toBe('sc/gp2'); // namespaced pvc moved
    });

    it('leaves a namespace-less controller / service ungrouped (fallback)', () => {
      const els = [
        clusterNode('cluster/prod', 'prod'),
        {
          group: 'nodes',
          data: { id: 'ctrl/api', label: 'api', kind: 'deployment', isController: true, parent: 'cluster/prod' },
        } as El,
      ];
      const out = applyNamespaceGrouping(els, 'controller');
      expect(nsBoxesOf(out)).toHaveLength(0);
      expect(D(elById(out).get('ctrl/api')!).parent).toBe('cluster/prod');
    });

    it('leaves a controller with no cluster ancestor ungrouped (top-level)', () => {
      const els = [
        {
          group: 'nodes',
          data: { id: 'ctrl/api', label: 'api', kind: 'deployment', isController: true, namespace: 'shop' },
        } as El,
      ];
      const out = applyNamespaceGrouping(els, 'controller');
      expect(nsBoxesOf(out)).toHaveLength(0);
      expect(D(elById(out).get('ctrl/api')!).parent).toBeUndefined();
    });

    it('does not mutate the input; controller and node modes never cross-contaminate', () => {
      const els = [clusterNode('cluster/prod', 'prod'), controllerNode('ctrl/api', 'api', 'cluster/prod', 'shop')];
      const snapshot = JSON.stringify(els);
      applyNamespaceGrouping(els, 'controller');
      applyNamespaceGrouping(els, 'node');
      expect(JSON.stringify(els)).toBe(snapshot);
      expect(D(els[1]!).parent).toBe('cluster/prod'); // re-parent did not leak onto input
    });
  });
});
