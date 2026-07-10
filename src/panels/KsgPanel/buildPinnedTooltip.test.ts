import type { NodeDetailData } from '../../features/node-detail';

import { buildPinnedTooltip } from './buildPinnedTooltip';

describe('buildPinnedTooltip', () => {
  it('maps null to null (no selection → no pinned card)', () => {
    expect(buildPinnedTooltip(null)).toBeNull();
  });

  it('maps a node with attributes and labels to a full PinnedTooltip', () => {
    const node: NodeDetailData = {
      id: 'pod-1',
      label: 'gateway',
      kind: 'pod',
      attributes: [
        { key: 'kind', value: 'pod' },
        { key: 'namespace', value: 'apps' },
      ],
      labels: { cluster: 'prod', namespace: 'apps' },
    };
    expect(buildPinnedTooltip(node)).toEqual({
      label: 'gateway',
      attributes: [
        { key: 'kind', value: 'pod' },
        { key: 'namespace', value: 'apps' },
      ],
      labels: { cluster: 'prod', namespace: 'apps' },
    });
  });

  it('omits the labels key when the node has no labels (exactOptionalPropertyTypes-safe)', () => {
    const node: NodeDetailData = {
      id: 'svc-1',
      label: 'mongo-svc',
      kind: 'service',
      attributes: [{ key: 'kind', value: 'service' }],
    };
    const result = buildPinnedTooltip(node);
    expect(result).toEqual({ label: 'mongo-svc', attributes: [{ key: 'kind', value: 'service' }] });
    expect(result).not.toHaveProperty('labels');
  });

  it('defaults attributes to [] when the node carries none', () => {
    const node: NodeDetailData = { id: 'n', label: 'bare' };
    expect(buildPinnedTooltip(node)).toEqual({ label: 'bare', attributes: [] });
  });

  it('builds a pinned card for a storageclass leaf (provisioner/parameters promoted)', () => {
    const node: NodeDetailData = {
      id: 'prod/storageclass/fast-ssd',
      label: 'fast-ssd',
      kind: 'storageclass',
      provisioner: 'rook-ceph.rbd.csi.ceph.com',
      attributes: [
        { key: 'kind', value: 'storageclass' },
        { key: 'provisioner', value: 'rook-ceph.rbd.csi.ceph.com' },
        { key: 'pool', value: 'kube', wrap: true },
      ],
    };
    expect(buildPinnedTooltip(node)).toEqual({
      label: 'fast-ssd',
      attributes: [
        { key: 'kind', value: 'storageclass' },
        { key: 'provisioner', value: 'rook-ceph.rbd.csi.ceph.com' },
        { key: 'pool', value: 'kube', wrap: true },
      ],
    });
  });
});
