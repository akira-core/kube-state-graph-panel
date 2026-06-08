// Patch the existing no-backend showcase (ksg-switch-demo.json) so its pods carry
// data.owner (+ labels.cluster) — that's what makes the Layout: Node|Controller
// toggle do something: the panel synthesizes the mongodb/nats StatefulSets +
// gateway/consumer Deployments, aggregates pods under them in controller mode, and
// frees the worker nodes to pin into the switch fabric. Idempotent.
//   node dev/nobackend/patch-showcase.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'provisioning/dashboards/ksg-switch-demo.json';

// pod name -> { owner, cluster }. The showcase pods are mongo-*/gateway (prod) and
// nats-*/consumer (dr). RS is pre-collapsed by the backend, so owners are top-level.
function ownerFor(name) {
  if (name.startsWith('mongo')) {
    return { owner: { kind: 'StatefulSet', name: 'mongodb' }, cluster: 'prod' };
  }
  if (name === 'gateway') {
    return { owner: { kind: 'Deployment', name: 'gateway' }, cluster: 'prod' };
  }
  if (name.startsWith('nats')) {
    return { owner: { kind: 'StatefulSet', name: 'nats' }, cluster: 'dr' };
  }
  if (name === 'consumer') {
    return { owner: { kind: 'Deployment', name: 'consumer' }, cluster: 'dr' };
  }
  return null;
}

const dash = JSON.parse(readFileSync(FILE, 'utf8'));
const target = dash.panels[0].targets[0];
const graph = JSON.parse(target.data);

let patched = 0;
for (const n of graph.elements.nodes) {
  const d = n.data;
  if (d.type !== 'pod') {
    continue;
  }
  const o = ownerFor(d.name);
  if (!o) {
    continue;
  }
  d.owner = o.owner;
  // The synthesized controller nests under the pod's cluster container, resolved
  // by labels.cluster — these showcase pods only had labels.namespace, so add it.
  d.labels = { ...(d.labels ?? {}), cluster: o.cluster };
  patched += 1;
}

target.data = JSON.stringify(graph);
dash.version = (dash.version ?? 1) + 1;
writeFileSync(FILE, JSON.stringify(dash, null, 2) + '\n');
console.log(`patched ${patched} pods with data.owner + labels.cluster in ${FILE}`);
