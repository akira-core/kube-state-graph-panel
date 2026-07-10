import { buildNodeAttributes } from './buildNodeAttributes';

// Minimal raw-data builder; the helper only reads promoted fields off the data bag.
function data(d: Record<string, unknown>): Record<string, unknown> {
  return { id: 'n1', ...d };
}

describe('buildNodeAttributes', () => {
  it('promotes a real data.kind', () => {
    expect(buildNodeAttributes(data({ kind: 'pod' }))).toEqual([{ key: 'kind', value: 'pod' }]);
  });

  it('synthesizes kind "application" for a kind-less application group', () => {
    expect(buildNodeAttributes(data({ isApplication: true }))).toEqual([{ key: 'kind', value: 'application' }]);
  });

  it('synthesizes kind "namespace" for a kind-less namespace group', () => {
    expect(buildNodeAttributes(data({ isNamespace: true }))).toEqual([{ key: 'kind', value: 'namespace' }]);
  });

  it('synthesizes kind "cluster" for a kind-less cluster group', () => {
    expect(buildNodeAttributes(data({ isCluster: true, cluster: 'prod' }))).toEqual([{ key: 'kind', value: 'cluster' }]);
  });

  it('promotes namespace, application and ipAddress (array joined)', () => {
    const attrs = buildNodeAttributes(
      data({ kind: 'pod', namespace: 'prod', application: 'mongodb', ipAddress: ['10.0.0.1', '10.0.0.2'] })
    );
    expect(attrs).toEqual([
      { key: 'kind', value: 'pod' },
      { key: 'namespace', value: 'prod' },
      { key: 'application', value: 'mongodb' },
      { key: 'ipAddress', value: '10.0.0.1, 10.0.0.2' },
    ]);
  });

  it('skips the application row on the application GROUP node itself', () => {
    const attrs = buildNodeAttributes(data({ isApplication: true, application: 'mongodb' }));
    expect(attrs).toEqual([{ key: 'kind', value: 'application' }]);
  });

  it('skips an empty-string application', () => {
    expect(buildNodeAttributes(data({ kind: 'service', application: '' }))).toEqual([{ key: 'kind', value: 'service' }]);
  });

  it('promotes provisioner and storageclass parameters key-sorted with wrap', () => {
    const attrs = buildNodeAttributes(
      data({ kind: 'storageclass', provisioner: 'rook-ceph', parameters: { pool: 'kube', cluster_id: 'rook' } })
    );
    expect(attrs).toEqual([
      { key: 'kind', value: 'storageclass' },
      { key: 'provisioner', value: 'rook-ceph' },
      { key: 'cluster_id', value: 'rook', wrap: true },
      { key: 'pool', value: 'kube', wrap: true },
    ]);
  });

  it('returns no rows for data carrying no promoted attrs (no empty rows)', () => {
    expect(buildNodeAttributes(data({}))).toEqual([]);
  });
});
