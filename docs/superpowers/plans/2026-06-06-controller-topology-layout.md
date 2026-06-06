# Controller Topology + Layout Control + Fabric Tiering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cluster > controller > pod` topology mode (pods aggregated under their controller) toggled from a segmented control at the top of the legend, with the K8s node pinned into the switch fabric (`pod → node → switch → switch`) in that mode — driven by the backend's new pod `data.owner` field, synthesized panel-side.

**Architecture:** The backend emits `data.owner = {kind,name}` on pods only. `normalizeGraph` **synthesizes** controller nodes + `controller-owns-pod` edges from that field; the existing `applyPodParentMode` mechanism (re-parent from a "source edge" + synthesize `pod-runs-on-node`) is generalized from `service` to `controller`. A segmented `Layout: Node|Controller` control replaces the `EdgeLegend` toggle; entering controller mode default-collapses every controller. In controller mode the K8s node (now a leaf) is pinned one tier above the switch fabric, and `node-to-switch` is restyled to match `switch-to-switch`.

**Tech Stack:** TypeScript 5.9 strict, React 18, cytoscape 3.33 (+ fcose, expand-collapse), `@grafana/ui`, Jest, `@testing-library/react`.

**OpenSpec source of truth:** `openspec/changes/icon-encoding-workload-topology/` (proposal/design D9–D12, specs for `graph-data-integration`, `pod-parent-mode`, `panel-rendering`, `switch-tier-layout`). Run `npx jest <file>` for single tests; `npm run typecheck` and `npm run lint` (zero-warnings) must pass at every commit.

---

## Shared contracts (referenced by tasks)

These exact names/shapes are used across tasks — keep them consistent.

- **New edge type:** `'controller-owns-pod'` added to `EdgeType` (`src/shared/constants/types.ts`). `DrawnEdgeType = Exclude<EdgeType, 'pod-runs-on-node'>` then automatically includes it.
- **Mode:** `PodParentMode` becomes `'node' | 'controller'` (was `'node' | 'service'`).
- **Synthesized controller node:** `data = { id, kind, label, isController: true, parent? }` where
  - `id = 'ctrl/' + cluster + '/' + namespace + '/' + kindLower + '/' + name` (cluster/namespace use `''` when absent),
  - `kind = ownerKind.toLowerCase()` (cast `as NodeKind`; unknown kinds e.g. bare `replicaset` are allowed — fallback icon, visible by default),
  - `label = ownerName`,
  - `parent` = the **actual** cluster-container id the pod belongs to (looked up by cluster name; omitted when none).
- **Synthesized owns edge:** `data = { id: 'syn:controller-owns-pod:' + controllerId + ':' + podId, source: controllerId, target: podId, edgeType: 'controller-owns-pod' }`.
- **Synthesized pod→node edge (controller mode, applyPodParentMode):** id `'ppm:pod-runs-on-node:' + podId`, only when the pod's pre-reparent parent is a **K8s `node`-kind** node present in elements.
- **`isController`** is a new optional `NodeDataDefinition` field (declaration-merged in `src/shared/types/cytoscape.d.ts`).
- **Node fabric tier (controller mode):** every K8s `node` that is the source of a `node-to-switch` edge is pinned at level `min(switchLevel) − 1`; merged into the level map by a **new** `readNodeFabricTier(...)` step (NOT inside `readSwitchLevels`).

---

## Phase 1 — Edge constants foundation (additive, stays green)

### Task 1: Add `controller-owns-pod` edge type + restyle `node-to-switch`

**Files:**

- Modify: `src/shared/constants/types.ts:28-35` (EdgeType union)
- Modify: `src/shared/constants/colorByEdgeType.ts:19-27` (EDGE_ENDPOINTS_BY_TYPE), `:40-63` (EDGE_STYLE_BY_TYPE, COLOR_BY_EDGE_TYPE)
- Test: `src/shared/constants/colorByEdgeType.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create/append `src/shared/constants/colorByEdgeType.test.ts`:

```ts
import { EDGE_STYLE_BY_TYPE, EDGE_ENDPOINTS_BY_TYPE, COLOR_BY_EDGE_TYPE } from './colorByEdgeType';

describe('colorByEdgeType', () => {
  it('defines a style + endpoints for controller-owns-pod', () => {
    expect(EDGE_STYLE_BY_TYPE['controller-owns-pod']).toBeDefined();
    expect(EDGE_ENDPOINTS_BY_TYPE['controller-owns-pod']).toEqual({ from: 'deployment', to: 'pod' });
    expect(COLOR_BY_EDGE_TYPE['controller-owns-pod']).toBe(EDGE_STYLE_BY_TYPE['controller-owns-pod']);
  });

  it('renders node-to-switch identically to switch-to-switch (shared infra colour)', () => {
    expect(EDGE_STYLE_BY_TYPE['node-to-switch'].color).toBe(EDGE_STYLE_BY_TYPE['switch-to-switch'].color);
    expect(EDGE_STYLE_BY_TYPE['node-to-switch'].lineStyle).toBe('solid');
  });

  it('exposes all 8 wire edge types', () => {
    expect(Object.keys(EDGE_STYLE_BY_TYPE)).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/shared/constants/colorByEdgeType.test.ts`
Expected: FAIL — `controller-owns-pod` missing; `node-to-switch` colour is `#6366f1` not `#06b6d4`.

- [ ] **Step 3: Implement**

In `src/shared/constants/types.ts`, add `controller-owns-pod` to the `EdgeType` union (after `service-selects-pod`):

```ts
export type EdgeType =
  | 'pod-runs-on-node'
  | 'pod-mounts-pvc'
  | 'pod-calls-pod'
  | 'pod-calls-service'
  | 'service-selects-pod'
  | 'controller-owns-pod'
  | 'switch-to-switch'
  | 'node-to-switch';
```

In `src/shared/constants/colorByEdgeType.ts`:

- Add to `EDGE_ENDPOINTS_BY_TYPE` (after `service-selects-pod`): `'controller-owns-pod': { from: 'deployment', to: 'pod' },`
- Add to `EDGE_STYLE_BY_TYPE` (after `service-selects-pod`): `'controller-owns-pod': { color: '#0ea5e9', lineStyle: 'solid' },`
- Change `'node-to-switch'` entry to `{ color: '#06b6d4', lineStyle: 'solid' }` (same as `switch-to-switch`) and update the comment above it from "distinct indigo direct uplink" to "shares the switch fabric infra colour + taxi routing".
- Add to `COLOR_BY_EDGE_TYPE` (it is `Record<DrawnEdgeType, EdgeStyle>`, so it now REQUIRES the key): `'controller-owns-pod': EDGE_STYLE_BY_TYPE['controller-owns-pod'],`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/shared/constants/colorByEdgeType.test.ts && npm run typecheck`
Expected: PASS; typecheck clean (note: `KsgPanel.types.ts` `ALL_EDGE_TYPES` now derives 8 types automatically — no change needed there).

- [ ] **Step 5: Commit**

```bash
git add src/shared/constants/types.ts src/shared/constants/colorByEdgeType.ts src/shared/constants/colorByEdgeType.test.ts
git commit -m "feat(edges): add controller-owns-pod edge type; node-to-switch shares switch infra colour"
```

---

## Phase 2 — Normalize synthesizes controllers from `data.owner`

### Task 2: Declaration-merge `isController` and parse pod owner

**Files:**

- Modify: `src/shared/types/cytoscape.d.ts` (NodeDataDefinition)
- Test: covered by Task 3 (no standalone test).

- [ ] **Step 1: Add the field**

In `src/shared/types/cytoscape.d.ts`, inside the `NodeDataDefinition` augmentation, add (next to `isCluster`):

```ts
    // true only on a panel-synthesized controller node (see normalize.ts);
    // distinguishes a controller container from a K8s `node` container in
    // controller mode (deriveNodeContainers).
    isController?: boolean;
```

- [ ] **Step 2: Verify typecheck still clean**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/cytoscape.d.ts
git commit -m "feat(types): add isController node data flag for synthesized controllers"
```

### Task 3: Synthesize controller nodes + owns edges in `normalizeGraph`

**Files:**

- Modify: `src/features/graph-data/normalize.ts`
- Test: `src/features/graph-data/normalize.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/features/graph-data/normalize.test.ts`:

```ts
import { normalizeGraph } from './normalize';

function podWithOwner(id: string, cluster: string, ns: string, owner: { kind: string; name: string }) {
  return {
    data: { id, name: id, type: 'pod', parent: `${cluster}/node-a`, owner, labels: { cluster, namespace: ns } },
  };
}

describe('normalizeGraph — controller synthesis', () => {
  it('synthesizes one controller node + an owns edge per owned pod, deduped by (cluster,ns,kind,name)', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } },
          {
            data: {
              id: 'prod/node-a',
              name: 'node-a',
              type: 'node',
              parent: 'cluster/prod',
              labels: { cluster: 'prod' },
            },
          },
          podWithOwner('prod/p1', 'prod', 'shop', { kind: 'StatefulSet', name: 'mongo' }),
          podWithOwner('prod/p2', 'prod', 'shop', { kind: 'StatefulSet', name: 'mongo' }),
        ],
        edges: [],
      },
    };
    const { elements } = normalizeGraph(raw);
    const controllers = elements.filter((e) => e.group === 'nodes' && (e.data as any).isController === true);
    expect(controllers).toHaveLength(1);
    const ctrl = controllers[0]!.data as any;
    expect(ctrl.kind).toBe('statefulset');
    expect(ctrl.label).toBe('mongo');
    expect(ctrl.parent).toBe('cluster/prod'); // reuses the actual cluster container id
    const owns = elements.filter((e) => e.group === 'edges' && (e.data as any).edgeType === 'controller-owns-pod');
    expect(owns).toHaveLength(2);
    expect(owns.map((e) => (e.data as any).target).sort()).toEqual(['prod/p1', 'prod/p2']);
    expect(owns.every((e) => (e.data as any).source === ctrl.id)).toBe(true);
  });

  it('keeps same-named controllers in different namespaces separate', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } },
          podWithOwner('prod/a1', 'prod', 'a', { kind: 'Deployment', name: 'api' }),
          podWithOwner('prod/b1', 'prod', 'b', { kind: 'Deployment', name: 'api' }),
        ],
        edges: [],
      },
    };
    const ctrls = normalizeGraph(raw).elements.filter((e) => (e.data as any).isController === true);
    expect(ctrls).toHaveLength(2);
  });

  it('does not synthesize for pods without an owner', () => {
    const raw = {
      elements: {
        nodes: [{ data: { id: 'prod/p1', name: 'p1', type: 'pod', labels: { cluster: 'prod', namespace: 'x' } } }],
        edges: [],
      },
    };
    expect(normalizeGraph(raw).elements.some((e) => (e.data as any).isController === true)).toBe(false);
  });

  it('falls back to legacy labels.owner_kind / owner_name', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } },
          {
            data: {
              id: 'prod/p1',
              name: 'p1',
              type: 'pod',
              parent: 'cluster/prod',
              labels: { cluster: 'prod', namespace: 'x', owner_kind: 'DaemonSet', owner_name: 'fluentd' },
            },
          },
        ],
        edges: [],
      },
    };
    const ctrl = normalizeGraph(raw).elements.find((e) => (e.data as any).isController === true)?.data as any;
    expect(ctrl?.kind).toBe('daemonset');
    expect(ctrl?.label).toBe('fluentd');
  });

  it('gives an owner-but-no-cluster pod a parentless (top-level) controller', () => {
    const raw = {
      elements: {
        nodes: [
          {
            data: {
              id: 'p1',
              name: 'p1',
              type: 'pod',
              labels: { namespace: 'x', owner_kind: 'Job', owner_name: 'batch' },
            },
          },
        ],
        edges: [],
      },
    };
    const ctrl = normalizeGraph(raw).elements.find((e) => (e.data as any).isController === true)?.data as any;
    expect(ctrl).toBeDefined();
    expect(ctrl.parent).toBeUndefined();
  });

  it('is deterministic and does not mutate input', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } },
          podWithOwner('prod/p1', 'prod', 'shop', { kind: 'Deployment', name: 'web' }),
        ],
        edges: [],
      },
    };
    const a = JSON.stringify(normalizeGraph(raw).elements);
    const b = JSON.stringify(normalizeGraph(raw).elements);
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/features/graph-data/normalize.test.ts -t 'controller synthesis'`
Expected: FAIL — no controllers synthesized.

- [ ] **Step 3: Implement synthesis in `normalize.ts`**

Add a helper above `normalizeGraph`:

```ts
interface PendingOwned {
  podId: string;
  ownerKind: string;
  ownerName: string;
  cluster: string; // '' when absent
  namespace: string; // '' when absent
}

// Read a pod's controller owner from the typed `data.owner` (current backend) or
// the legacy `labels.owner_kind` / `labels.owner_name` (pre-f050092). Returns the
// {kind,name} or undefined when the pod has no controller.
function parseOwner(
  d: Record<string, unknown>,
  labels: Record<string, string> | undefined
): { kind: string; name: string } | undefined {
  const owner = d.owner;
  if (isPlainObject(owner) && isString(owner.kind) && isString(owner.name)) {
    return { kind: owner.kind, name: owner.name };
  }
  if (labels && isString(labels.owner_kind) && isString(labels.owner_name)) {
    return { kind: labels.owner_kind, name: labels.owner_name };
  }
  return undefined;
}
```

Inside `normalizeGraph`, declare collectors before the node loop (next to `const nodeIds = new Set<string>();`):

```ts
const pendingOwned: PendingOwned[] = [];
const clusterIdByName = new Map<string, string>();
```

In the node loop, populate them. After computing `identity`/`label`, add:

```ts
if (isCluster) {
  clusterIdByName.set(label, d.id);
} else if (d.type === 'pod') {
  const owner = parseOwner(d, labels);
  if (owner !== undefined) {
    pendingOwned.push({
      podId: d.id,
      ownerKind: owner.kind,
      ownerName: owner.name,
      cluster: labels?.cluster ?? '',
      namespace: namespace ?? '',
    });
  }
}
```

After the edges loop (just before `return { elements, errors };`), append synthesis:

```ts
// Synthesize controller nodes + controller-owns-pod edges from pod owners. The
// backend emits owner metadata on pods only; the panel materializes the
// controller node the contract implies (deduped) and the owns edge. Deterministic.
const controllerSeen = new Set<string>();
const ownsEdges: cytoscape.ElementDefinition[] = [];
const sortedOwned = [...pendingOwned].sort((a, b) => a.podId.localeCompare(b.podId));
for (const o of sortedOwned) {
  const kindLower = o.ownerKind.toLowerCase();
  const controllerId = `ctrl/${o.cluster}/${o.namespace}/${kindLower}/${o.ownerName}`;
  if (!controllerSeen.has(controllerId)) {
    controllerSeen.add(controllerId);
    const parent = o.cluster === '' ? undefined : clusterIdByName.get(o.cluster);
    elements.push({
      group: 'nodes',
      data: {
        id: controllerId,
        kind: kindLower as NodeKind,
        isController: true,
        label: o.ownerName,
        ...(parent !== undefined ? { parent } : {}),
      },
    });
  }
  ownsEdges.push({
    group: 'edges',
    data: {
      id: `syn:controller-owns-pod:${controllerId}:${o.podId}`,
      source: controllerId,
      target: o.podId,
      edgeType: 'controller-owns-pod',
    },
  });
}
elements.push(...ownsEdges);
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/features/graph-data/normalize.test.ts && npm run typecheck`
Expected: PASS (all synthesis cases + existing normalize tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/graph-data/normalize.ts src/features/graph-data/normalize.test.ts
git commit -m "feat(normalize): synthesize controller nodes + controller-owns-pod edges from pod data.owner"
```

---

## Phase 3 — Topology pivot: `PodParentMode` → `node | controller`

> This phase changes a shared type and its consumers together. Typecheck/tests go red mid-phase and are green again at Task 6's commit. Do the tasks in order without committing until each task's own verify step passes.

### Task 4: Rewrite `applyPodParentMode` for controller mode (tests first)

**Files:**

- Modify: `src/features/pod-parent-mode/applyPodParentMode.ts`
- Modify: `src/features/pod-parent-mode/applyPodParentMode.test.ts` (rewrite service cases → controller)
- Modify: `src/shared/constants/types.ts:80` (PodParentMode)

- [ ] **Step 1: Write the failing tests** (replace the `service`-mode cases)

Replace the body of `src/features/pod-parent-mode/applyPodParentMode.test.ts` with:

```ts
import type cytoscape from 'cytoscape';
import { applyPodParentMode } from './applyPodParentMode';

function node(id: string, kind: string, parent?: string): cytoscape.ElementDefinition {
  return { group: 'nodes', data: { id, kind, ...(parent ? { parent } : {}) } };
}
function owns(ctrl: string, pod: string): cytoscape.ElementDefinition {
  return {
    group: 'edges',
    data: { id: `o:${ctrl}:${pod}`, source: ctrl, target: pod, edgeType: 'controller-owns-pod' },
  };
}

describe('applyPodParentMode', () => {
  it('node mode returns input referentially unchanged', () => {
    const els = [node('n1', 'node'), node('p1', 'pod', 'n1')];
    expect(applyPodParentMode(els, 'node')).toBe(els);
  });

  it('controller mode re-parents pod under its controller, drops owns edge, synthesizes pod-runs-on-node', () => {
    const els = [node('n1', 'node'), node('c1', 'deployment'), node('p1', 'pod', 'n1'), owns('c1', 'p1')];
    const out = applyPodParentMode(els, 'controller');
    const p1 = out.find((e) => (e.data as any).id === 'p1')!.data as any;
    expect(p1.parent).toBe('c1');
    expect(out.some((e) => (e.data as any).edgeType === 'controller-owns-pod')).toBe(false);
    const pr = out.find((e) => (e.data as any).edgeType === 'pod-runs-on-node')!.data as any;
    expect(pr).toMatchObject({ id: 'ppm:pod-runs-on-node:p1', source: 'p1', target: 'n1' });
  });

  it('controller mode picks the lexicographically smallest controller for multi-owner pods', () => {
    const els = [
      node('n1', 'node'),
      node('b-ctrl', 'deployment'),
      node('a-ctrl', 'deployment'),
      node('p1', 'pod', 'n1'),
      owns('b-ctrl', 'p1'),
      owns('a-ctrl', 'p1'),
    ];
    const out = applyPodParentMode(els, 'controller');
    expect((out.find((e) => (e.data as any).id === 'p1')!.data as any).parent).toBe('a-ctrl');
    expect(out.some((e) => (e.data as any).edgeType === 'controller-owns-pod')).toBe(false);
  });

  it('pod with no owns edge is left untouched', () => {
    const els = [node('n1', 'node'), node('p1', 'pod', 'n1')];
    const out = applyPodParentMode(els, 'controller');
    expect((out.find((e) => (e.data as any).id === 'p1')!.data as any).parent).toBe('n1');
    expect(out.some((e) => (e.data as any).edgeType === 'pod-runs-on-node')).toBe(false);
  });

  it('does NOT synthesize pod-runs-on-node when the pod original parent is not a K8s node (e.g. a cluster)', () => {
    // pod parented to a cluster container (isCluster), not a node kind:
    const cluster: cytoscape.ElementDefinition = { group: 'nodes', data: { id: 'cl', isCluster: true } };
    const c1 = node('c1', 'deployment');
    const p1 = node('p1', 'pod', 'cl');
    const out = applyPodParentMode([cluster, c1, p1, owns('c1', 'p1')], 'controller');
    expect((out.find((e) => (e.data as any).id === 'p1')!.data as any).parent).toBe('c1');
    expect(out.some((e) => (e.data as any).edgeType === 'pod-runs-on-node')).toBe(false);
  });

  it('keeps service edges in both modes and does not mutate input', () => {
    const svcEdge: cytoscape.ElementDefinition = {
      group: 'edges',
      data: { id: 's', source: 'svc', target: 'p1', edgeType: 'service-selects-pod' },
    };
    const els = [node('n1', 'node'), node('c1', 'deployment'), node('p1', 'pod', 'n1'), owns('c1', 'p1'), svcEdge];
    const snapshot = JSON.stringify(els);
    const out = applyPodParentMode(els, 'controller');
    expect(out.some((e) => (e.data as any).edgeType === 'service-selects-pod')).toBe(true);
    expect(JSON.stringify(els)).toBe(snapshot); // input untouched
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/features/pod-parent-mode/applyPodParentMode.test.ts`
Expected: FAIL/compile error (`'controller'` not assignable; old logic reads `service-selects-pod`).

- [ ] **Step 3: Change the mode type**

In `src/shared/constants/types.ts`, replace the `PodParentMode` definition + comment:

```ts
// Which K8s object a pod is compound-nested under (panel-side view toggle, not a
// wire value). 'node' (default) = backend's view: pod nests in its K8s node,
// `controller-owns-pod` is a drawn edge and `pod-runs-on-node` is nesting.
// 'controller' = pod nests under its owning controller; `controller-owns-pod`
// becomes nesting and `pod-runs-on-node` is drawn. See features/pod-parent-mode.
export type PodParentMode = 'node' | 'controller';
```

- [ ] **Step 4: Rewrite `applyPodParentMode.ts`**

Replace the file body with the controller generalization (source edge `controller-owns-pod`; original parent must be a `node`-kind node):

```ts
import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../shared/constants/types';

const SYNTHETIC_EDGE_PREFIX = 'ppm:pod-runs-on-node:';

/**
 * Re-shape the normalized graph for the given pod-parent mode.
 *
 * `node` mode is the backend's native view (returned unchanged): pods nest in
 * their K8s node, `controller-owns-pod` is a drawn edge, `pod-runs-on-node` is
 * nesting.
 *
 * `controller` mode makes the graph controller-centric: every pod that is the
 * target of a `controller-owns-pod` edge is re-parented under the
 * lexicographically smallest owning controller; all `controller-owns-pod` edges
 * are dropped (that relationship is now nesting); and a `pod-runs-on-node` edge
 * is synthesized from the pod to its ORIGINAL K8s `node` parent — but only when
 * that original parent is a `node`-kind node present in elements (a pod parented
 * to a cluster, or to nothing, gets re-parented to the controller with no edge).
 * Service edges (`service-selects-pod` / `pod-calls-service`) are kept in both
 * modes.
 *
 * Pure and immutable: input is never mutated; changed nodes are fresh objects.
 */
export function applyPodParentMode(
  elements: cytoscape.ElementDefinition[],
  mode: PodParentMode
): cytoscape.ElementDefinition[] {
  if (mode === 'node') {
    return elements;
  }

  // K8s node-kind ids (valid pod-runs-on-node targets) + owning controllers per pod.
  const nodeKindIds = new Set<string>();
  const controllersByPod = new Map<string, string[]>();
  for (const el of elements) {
    if (el.group === 'nodes') {
      const data = el.data as Record<string, unknown>;
      if (typeof data.id === 'string' && data.kind === 'node') {
        nodeKindIds.add(data.id);
      }
      continue;
    }
    const data = el.data as Record<string, unknown>;
    if (data.edgeType !== 'controller-owns-pod') {
      continue;
    }
    const controller = data.source;
    const pod = data.target;
    if (typeof controller !== 'string' || typeof pod !== 'string') {
      continue;
    }
    const existing = controllersByPod.get(pod);
    if (existing) {
      existing.push(controller);
    } else {
      controllersByPod.set(pod, [controller]);
    }
  }

  // Resolve each re-parented pod's chosen controller + original node parent.
  const chosenControllerByPod = new Map<string, string>();
  const originalNodeByPod = new Map<string, string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    if (typeof id !== 'string' || data.kind !== 'pod') {
      continue;
    }
    const controllers = controllersByPod.get(id);
    if (controllers === undefined || controllers.length === 0) {
      continue;
    }
    const chosen = [...controllers].sort()[0];
    if (chosen === undefined) {
      continue;
    }
    chosenControllerByPod.set(id, chosen);
    // Only synthesize pod-runs-on-node when the ORIGINAL parent is a real K8s node.
    if (typeof data.parent === 'string' && nodeKindIds.has(data.parent)) {
      originalNodeByPod.set(id, data.parent);
    }
  }

  const result: cytoscape.ElementDefinition[] = [];
  for (const el of elements) {
    if (el.group === 'edges') {
      const data = el.data as Record<string, unknown>;
      // controller-owns-pod is nesting in controller mode — never drawn.
      if (data.edgeType === 'controller-owns-pod') {
        continue;
      }
      result.push(el);
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const chosen = typeof id === 'string' ? chosenControllerByPod.get(id) : undefined;
    if (chosen !== undefined) {
      result.push({ ...el, data: { ...data, parent: chosen } });
    } else {
      result.push(el);
    }
  }

  for (const [podId, nodeId] of originalNodeByPod) {
    result.push({
      group: 'edges',
      data: {
        id: `${SYNTHETIC_EDGE_PREFIX}${podId}`,
        source: podId,
        target: nodeId,
        edgeType: 'pod-runs-on-node',
      },
    } as unknown as cytoscape.ElementDefinition);
  }

  return result;
}
```

- [ ] **Step 5: Run the applyPodParentMode tests**

Run: `npx jest src/features/pod-parent-mode/applyPodParentMode.test.ts`
Expected: PASS (typecheck of the whole project will still fail — fixed in Task 5/6).

### Task 5: Update `drawnEdgeTypesForMode` to controller + 8 types

**Files:**

- Modify: `src/shared/constants/drawnEdgeTypesForMode.ts`
- Modify: `src/shared/constants/drawnEdgeTypesForMode.test.ts`

- [ ] **Step 1: Write/replace the failing test**

Replace `src/shared/constants/drawnEdgeTypesForMode.test.ts` body:

```ts
import { drawnEdgeTypesForMode } from './drawnEdgeTypesForMode';

describe('drawnEdgeTypesForMode', () => {
  it('node mode: service edges + controller-owns-pod + both switch edges, no pod-runs-on-node', () => {
    const t = drawnEdgeTypesForMode('node');
    expect(t).toEqual(
      expect.arrayContaining([
        'pod-mounts-pvc',
        'pod-calls-pod',
        'pod-calls-service',
        'service-selects-pod',
        'controller-owns-pod',
        'switch-to-switch',
        'node-to-switch',
      ])
    );
    expect(t).not.toContain('pod-runs-on-node');
    expect(t).toHaveLength(7);
  });
  it('controller mode: service edges + pod-runs-on-node + both switch edges, no controller-owns-pod', () => {
    const t = drawnEdgeTypesForMode('controller');
    expect(t).toEqual(
      expect.arrayContaining([
        'pod-mounts-pvc',
        'pod-calls-pod',
        'pod-calls-service',
        'service-selects-pod',
        'pod-runs-on-node',
        'switch-to-switch',
        'node-to-switch',
      ])
    );
    expect(t).not.toContain('controller-owns-pod');
    expect(t).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/shared/constants/drawnEdgeTypesForMode.test.ts`
Expected: FAIL (compile: `'controller'` key missing; counts wrong).

- [ ] **Step 3: Implement**

Replace `DRAWN_BY_MODE` in `src/shared/constants/drawnEdgeTypesForMode.ts` and update the comment:

```ts
const SWITCH_EDGES = ['switch-to-switch', 'node-to-switch'] as const;
const DRAWN_BY_MODE: Record<PodParentMode, readonly EdgeType[]> = {
  node: [
    'pod-mounts-pvc',
    'pod-calls-pod',
    'pod-calls-service',
    'service-selects-pod',
    'controller-owns-pod',
    ...SWITCH_EDGES,
  ],
  controller: [
    'pod-mounts-pvc',
    'pod-calls-pod',
    'pod-calls-service',
    'service-selects-pod',
    'pod-runs-on-node',
    ...SWITCH_EDGES,
  ],
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/shared/constants/drawnEdgeTypesForMode.test.ts`
Expected: PASS.

### Task 6: Fix remaining `'service'` references; project goes green

**Files:**

- Modify: `src/features/legend/components/EdgeLegend/EdgeLegend.tsx` (remove toggle + mode default uses `'node'`) — full removal is Task 9; here just unblock typecheck
- Modify: `src/panels/KsgPanel/KsgPanel.tsx:116-119` (toggle flips to `'controller'`)
- Modify: comments in `src/features/graph-canvas/hooks/useCytoscape.ts:24-28,107` and `src/shared/constants/colorByEdgeType.ts` (service→controller wording)

- [ ] **Step 1: Update KsgPanel toggle target**

In `src/panels/KsgPanel/KsgPanel.tsx`, change `togglePodParentMode` (will be replaced by the segmented control in Task 8, but keep compiling now):

```ts
const togglePodParentMode = useCallback(() => {
  setPodParentMode((mode) => (mode === 'node' ? 'controller' : 'node'));
}, []);
```

- [ ] **Step 2: Unblock EdgeLegend typecheck**

In `src/features/legend/components/EdgeLegend/EdgeLegend.tsx`, the `mode` prop type `PodParentMode` is fine; only the toggle label strings reference behaviour. Leave functioning for now (full removal in Task 9). Confirm it compiles.

- [ ] **Step 3: Run full typecheck + the affected suites**

Run: `npm run typecheck && npx jest src/features/pod-parent-mode src/shared/constants`
Expected: PASS. Fix any remaining `'service'` string literal the compiler flags (search: `rg "'service'" src` — only `pod-calls-service`/`service-selects-pod`/`'service'` NodeKind are legitimate; a `PodParentMode === 'service'` comparison is not).

- [ ] **Step 4: Run the whole test suite**

Run: `npm run test:ci`
Expected: PASS (KsgPanel/EdgeLegend tests may still assert the old toggle label — update those assertions to the new wording or defer to Task 8/9; ensure suite is green before committing).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(topology): PodParentMode node|controller; applyPodParentMode + drawnEdgeTypesForMode controller mode"
```

---

## Phase 4 — Stylesheet routing + switch-fabric node tiering

### Task 7: Route `node-to-switch` orthogonally (taxi) in the stylesheet

**Files:**

- Modify: `src/features/graph-canvas/styles/getStylesheet.ts:244` (taxi selector)
- Modify: `src/features/graph-canvas/styles/getStylesheet.test.ts` + snapshot

- [ ] **Step 1: Write the failing test**

Append to `src/features/graph-canvas/styles/getStylesheet.test.ts`:

```ts
import { createTheme } from '@grafana/data';
import { getStylesheet } from './getStylesheet';

it('routes node-to-switch with taxi like switch-to-switch', () => {
  const sheet = getStylesheet({ theme: createTheme() });
  const sel = sheet.find(
    (s) => (s as any).selector === "edge[edgeType='switch-to-switch'], edge[edgeType='node-to-switch']"
  );
  expect(sel).toBeDefined();
  expect((sel as any).style['curve-style']).toBe('taxi');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/features/graph-canvas/styles/getStylesheet.test.ts -t 'taxi'`
Expected: FAIL — current selector matches only `switch-to-switch`.

- [ ] **Step 3: Implement**

In `getStylesheet.ts`, change the taxi selector (line ~244) from
`selector: "edge[edgeType='switch-to-switch']",`
to
`selector: "edge[edgeType='switch-to-switch'], edge[edgeType='node-to-switch']",`
and update the comment block above it: node→switch is no longer excluded — it shares the fabric's taxi routing + infra colour.

- [ ] **Step 4: Run + update snapshot**

Run: `npx jest src/features/graph-canvas/styles/getStylesheet.test.ts -u`
Expected: PASS; snapshot updated to include `node-to-switch` in the taxi selector.

- [ ] **Step 5: Commit**

```bash
git add src/features/graph-canvas/styles/getStylesheet.ts src/features/graph-canvas/styles/getStylesheet.test.ts src/features/graph-canvas/styles/__snapshots__/getStylesheet.test.ts.snap
git commit -m "feat(stylesheet): node-to-switch routes taxi like switch-to-switch (spec compliance)"
```

### Task 8: Pin controller-mode K8s nodes one tier above the fabric

**Files:**

- Create: `src/features/switch-topology/readNodeFabricTier.ts` + `readNodeFabricTier.test.ts`
- Modify: `src/features/switch-topology/index.ts`
- Modify: `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx:71`

- [ ] **Step 1: Write the failing test**

Create `src/features/switch-topology/readNodeFabricTier.test.ts`:

```ts
import type cytoscape from 'cytoscape';
import { readNodeFabricTier } from './readNodeFabricTier';
import { readSwitchLevels } from './readSwitchLevels';

function sw(id: string, level: string): cytoscape.ElementDefinition {
  return { group: 'nodes', data: { id, kind: 'switch', labels: { level } } };
}
function node(id: string): cytoscape.ElementDefinition {
  return { group: 'nodes', data: { id, kind: 'node' } };
}
function n2s(node: string, sw: string): cytoscape.ElementDefinition {
  return { group: 'edges', data: { id: `e:${node}:${sw}`, source: node, target: sw, edgeType: 'node-to-switch' } };
}

describe('readNodeFabricTier', () => {
  it('controller mode: fabric-connected nodes pinned to min(level)-1', () => {
    const els = [sw('s0', '0'), sw('s1', '1'), node('n1'), n2s('n1', 's1')];
    const merged = readNodeFabricTier(els, 'controller', readSwitchLevels(els));
    expect(merged.get('n1')).toBe(-1);
    expect(merged.get('s0')).toBe(0); // switches preserved
  });
  it('node mode: no node pinned', () => {
    const els = [sw('s0', '0'), node('n1'), n2s('n1', 's0')];
    expect(readNodeFabricTier(els, 'node', readSwitchLevels(els)).has('n1')).toBe(false);
  });
  it('node with no node-to-switch edge is not pinned', () => {
    const els = [sw('s0', '0'), node('n1')];
    expect(readNodeFabricTier(els, 'controller', readSwitchLevels(els)).has('n1')).toBe(false);
  });
  it('no levelled switch: returns the switch map unchanged (no node tier)', () => {
    const els = [node('n1')];
    expect(readNodeFabricTier(els, 'controller', readSwitchLevels(els)).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/features/switch-topology/readNodeFabricTier.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `readNodeFabricTier.ts`**

```ts
import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../shared/constants/types';

interface ElementDataView {
  id?: string;
  kind?: string;
  source?: string;
  target?: string;
  edgeType?: string;
}

// Merge a derived K8s-node tier into the switch level map for the controller
// mode. Every `node` that is the source of a `node-to-switch` edge is placed one
// tier ABOVE the topmost switch row (min level − 1), so the fabric reads
// `pod → node → switch → switch` top-to-bottom. Switches keep their own levels.
// In node mode, or with no levelled switch, the switch map is returned unchanged
// (no node pinned). Pure; does NOT extend readSwitchLevels (which stays
// switch-only / non-negative) — negative levels are produced here and consumed by
// buildSwitchConstraints (y = level * TIER_GAP supports y = −180).
export function readNodeFabricTier(
  elements: readonly cytoscape.ElementDefinition[],
  mode: PodParentMode,
  switchLevels: ReadonlyMap<string, number>
): Map<string, number> {
  const merged = new Map<string, number>(switchLevels);
  if (mode !== 'controller' || switchLevels.size === 0) {
    return merged;
  }
  let minLevel = Infinity;
  for (const level of switchLevels.values()) {
    if (level < minLevel) {
      minLevel = level;
    }
  }
  const fabricNodeIds = new Set<string>();
  for (const el of elements) {
    const data = el.data as ElementDataView;
    if (el.group === 'edges' || (data.source !== undefined && data.target !== undefined)) {
      if (data.edgeType === 'node-to-switch' && typeof data.source === 'string') {
        fabricNodeIds.add(data.source);
      }
    }
  }
  const nodeTier = minLevel - 1;
  for (const el of elements) {
    const data = el.data as ElementDataView;
    const isNode =
      el.group === 'nodes' || (el.group === undefined && data.source === undefined && data.target === undefined);
    if (isNode && data.kind === 'node' && typeof data.id === 'string' && fabricNodeIds.has(data.id)) {
      merged.set(data.id, nodeTier);
    }
  }
  return merged;
}
```

Add to `src/features/switch-topology/index.ts`:

```ts
export { readNodeFabricTier } from './readNodeFabricTier';
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/features/switch-topology/readNodeFabricTier.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into GraphCanvas (mode-aware)**

In `src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx`, change the import and line ~71:

```ts
import { buildSwitchConstraints, readNodeFabricTier, readSwitchLevels } from '../../../switch-topology';
// ...
const switchConstraints = useMemo(
  () => buildSwitchConstraints(readNodeFabricTier(elements, podParentMode ?? 'node', readSwitchLevels(elements))),
  [elements, podParentMode]
);
```

- [ ] **Step 6: Run typecheck + suite**

Run: `npm run typecheck && npx jest src/features/switch-topology src/features/graph-canvas`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/switch-topology/ src/features/graph-canvas/components/GraphCanvas/GraphCanvas.tsx
git commit -m "feat(layout): controller mode pins K8s nodes one tier above the switch fabric"
```

---

## Phase 5 — Legend UI: segmented control, default-collapse, mode-aware containers

> Tasks 9–11 are interdependent (EdgeLegend props, `deriveContainers` rename, and the KsgPanel wiring must change together to compile). Treat them as a coordinated set: run each task's own unit tests as you go, but **commit once at the end of Task 11**. Full `npm run typecheck` is expected to be red between Task 9 and Task 11.

### Task 9: `LayoutModeControl` segmented control + remove EdgeLegend toggle

**Files:**

- Create: `src/features/legend/components/LayoutModeControl/{LayoutModeControl.tsx,LayoutModeControl.types.ts,LayoutModeControl.test.tsx,index.ts}`
- Modify: `src/features/legend/index.ts`
- Modify: `src/features/legend/components/EdgeLegend/EdgeLegend.tsx` (drop `mode`/`onToggleMode` + the IconButton)

- [ ] **Step 1: Write the failing test**

Create `src/features/legend/components/LayoutModeControl/LayoutModeControl.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { LayoutModeControl } from './LayoutModeControl';

it('renders a Node|Controller segmented control and reports changes', async () => {
  const onChange = jest.fn();
  render(<LayoutModeControl mode="node" onChange={onChange} />);
  expect(screen.getByText('Layout')).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText('Controller'));
  expect(onChange).toHaveBeenCalledWith('controller');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/features/legend/components/LayoutModeControl`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

`LayoutModeControl.types.ts`:

```ts
import type { PodParentMode } from '../../../../shared/constants/types';

export interface LayoutModeControlProps {
  mode: PodParentMode;
  onChange: (mode: PodParentMode) => void;
}
```

`LayoutModeControl.tsx`:

```tsx
import { css } from '@emotion/css';
import { RadioButtonGroup, useStyles2 } from '@grafana/ui';
import React from 'react';

import type { PodParentMode } from '../../../../shared/constants/types';
import type { LayoutModeControlProps } from './LayoutModeControl.types';

const OPTIONS: Array<{ label: string; value: PodParentMode }> = [
  { label: 'Node', value: 'node' },
  { label: 'Controller', value: 'controller' },
];

function getStyles(): { root: string; label: string } {
  return {
    root: css({ display: 'flex', flexDirection: 'column', gap: 4 }),
    label: css({ fontSize: 11, fontWeight: 500, opacity: 0.85 }),
  };
}

// The pod-parent topology toggle, at the very top of the legend. Switches the
// compound grouping between cluster>node>pod and cluster>controller>pod. This is
// NOT the fcose/dagre layout-algorithm option — it changes nesting, not the engine.
export function LayoutModeControl({ mode, onChange }: Readonly<LayoutModeControlProps>): React.JSX.Element {
  const styles = useStyles2(getStyles);
  return (
    <div className={styles.root} data-testid="layout-mode-control">
      <span className={styles.label}>Layout</span>
      <RadioButtonGroup options={OPTIONS} value={mode} onChange={(v) => onChange(v)} size="sm" fullWidth />
    </div>
  );
}
```

`index.ts`:

```ts
export { LayoutModeControl } from './LayoutModeControl';
export type { LayoutModeControlProps } from './LayoutModeControl.types';
```

Add to `src/features/legend/index.ts`:

```ts
export { LayoutModeControl } from './components/LayoutModeControl';
```

- [ ] **Step 4: Strip the toggle from EdgeLegend**

In `src/features/legend/components/EdgeLegend/EdgeLegend.tsx`:

- Remove the `IconButton` import.
- Remove `mode` and `onToggleMode` from `EdgeLegendProps`; default the edge list to `drawnEdgeTypesForMode('node')`:
  `const types = (edgeTypes ?? drawnEdgeTypesForMode('node')).filter((t) => t in EDGE_STYLE_BY_TYPE);`
- Remove the `toggleLabel` line and the header `IconButton` block — replace the `<div className={styles.header}>…</div>` with a plain `<h4>Edge types</h4>` (and drop the now-unused `header` style + `PodParentMode` import).

- [ ] **Step 5: Run the legend unit tests**

Run: `npx jest src/features/legend`
Expected: PASS — LayoutModeControl + EdgeLegend suites green (update any EdgeLegend test referencing `pod-parent-mode-toggle` to assert it is absent). Do NOT run full typecheck yet (KsgPanel still passes the removed props until Task 11).

- [ ] **Step 6: Do NOT commit yet**

Phase 5 lands as one commit at Task 11 (EdgeLegend / containers / KsgPanel are interdependent).

### Task 10: Mode-aware containers (`deriveNodeContainers`) + NodeContainerLegend title

**Files:**

- Modify: `src/panels/KsgPanel/deriveNodeContainers.ts` (+ test)
- Modify: `src/features/legend/components/NodeContainerLegend/NodeContainerLegend.tsx` (+ its props/test)

- [ ] **Step 1: Write the failing test**

Append to `src/panels/KsgPanel/deriveNodeContainers.test.ts`:

```ts
import { deriveContainers } from './deriveNodeContainers';

it('controller mode derives controller containers, not K8s nodes', () => {
  const els = [
    { group: 'nodes', data: { id: 'cl', isCluster: true, clusterColor: '#abc' } },
    { group: 'nodes', data: { id: 'c1', kind: 'deployment', isController: true, label: 'web', parent: 'cl' } },
    { group: 'nodes', data: { id: 'p1', kind: 'pod', parent: 'c1' } },
  ] as any;
  const out = deriveContainers(els, '#999', 'controller', new Set());
  expect(out.containerIds).toEqual(['c1']);
  expect(out.containerEntries.map((e) => e.name)).toEqual(['web']);
  expect(out.title).toBe('Controllers');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/panels/KsgPanel/deriveNodeContainers.test.ts -t 'controller mode'`
Expected: FAIL — `deriveContainers` not exported.

- [ ] **Step 3: Generalize `deriveNodeContainers.ts`**

Rename the export to `deriveContainers` with a `mode` param; keep a thin `deriveNodeContainers` wrapper for callers that still want node-mode semantics is unnecessary — update the single caller (KsgPanel) instead. New signature + body:

```ts
import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../shared/constants/types';

export interface NodeContainerEntry {
  name: string;
  color: string;
}

export interface ContainerDerivation {
  containerEntries: NodeContainerEntry[]; // name-deduped, cluster-coloured swatches
  containerIds: string[]; // every container id (not name-deduped) for the collapse toggle
  title: string; // 'Nodes' (node mode) | 'Controllers' (controller mode)
  collapseNoun: string; // 'nodes' | 'controllers'
  // True when `node` should appear in the icon Node-kinds legend: in controller
  // mode K8s nodes are leaves (always true if any node present); in node mode a
  // node earns it only as a drawn leaf OR a collapsed container.
  showNodeKindIcon: boolean;
}

// A container in `node` mode is a K8s `node` that boxes pods; in `controller` mode
// it is a synthesized controller (isController) that boxes pods. Pure + deterministic.
export function deriveContainers(
  elements: readonly cytoscape.ElementDefinition[],
  fallbackColor: string,
  mode: PodParentMode,
  collapsedIds: ReadonlySet<string> = new Set<string>()
): ContainerDerivation {
  const parentIds = new Set<string>();
  const clusterColorById = new Map<string, string>();
  let anyNodeKind = false;
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as Record<string, unknown>;
    if (typeof d.parent === 'string') {
      parentIds.add(d.parent);
    }
    if (d.kind === 'node') {
      anyNodeKind = true;
    }
    if (d.isCluster === true && typeof d.id === 'string' && typeof d.clusterColor === 'string') {
      clusterColorById.set(d.id, d.clusterColor);
    }
  }

  const isContainerKind = (d: Record<string, unknown>): boolean =>
    mode === 'controller' ? d.isController === true : d.kind === 'node';

  const containerEntries: NodeContainerEntry[] = [];
  const containerIds: string[] = [];
  const seenNames = new Set<string>();
  let showNodeKindIcon = mode === 'controller' && anyNodeKind; // nodes are leaves in controller mode
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as Record<string, unknown>;
    if (!isContainerKind(d) || typeof d.id !== 'string') {
      // A K8s node that is NOT a container in node mode (drawn leaf) earns its icon.
      if (mode === 'node' && d.kind === 'node' && typeof d.id === 'string' && !parentIds.has(d.id)) {
        showNodeKindIcon = true;
      }
      continue;
    }
    if (!parentIds.has(d.id)) {
      // A container kind with no children → drawn leaf, shows its icon (node mode only).
      if (mode === 'node') {
        showNodeKindIcon = true;
      }
      continue;
    }
    containerIds.push(d.id);
    if (mode === 'node' && collapsedIds.has(d.id)) {
      showNodeKindIcon = true;
    }
    const name = typeof d.label === 'string' ? d.label : d.id;
    if (seenNames.has(name)) {
      continue;
    }
    seenNames.add(name);
    const parentColor = typeof d.parent === 'string' ? clusterColorById.get(d.parent) : undefined;
    containerEntries.push({ name, color: parentColor ?? fallbackColor });
  }

  return {
    containerEntries,
    containerIds,
    title: mode === 'controller' ? 'Controllers' : 'Nodes',
    collapseNoun: mode === 'controller' ? 'controllers' : 'nodes',
    showNodeKindIcon,
  };
}
```

- [ ] **Step 4: Make NodeContainerLegend accept a title/noun**

In `NodeContainerLegend.tsx`, add optional `title`/`collapseNoun` props (defaulting to `'Nodes'`/`'nodes'`) and pass them through to `SwatchLegend`:

```tsx
export interface NodeContainerLegendProps {
  nodes: readonly NodeContainerLegendEntry[];
  onToggleCollapseAll?: () => void;
  allCollapsed?: boolean;
  title?: string;
  collapseNoun?: string;
}
// ...
return (
  <SwatchLegend
    title={title ?? 'Nodes'}
    testId="node-container-legend"
    rowTestIdPrefix="node-container-legend-row-"
    entries={nodes}
    collapseToggleTestId="node-collapse-toggle"
    collapseNoun={collapseNoun ?? 'nodes'}
    allCollapsed={allCollapsed}
    {...(onToggleCollapseAll !== undefined ? { onToggleCollapseAll } : {})}
  />
);
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx jest src/panels/KsgPanel/deriveNodeContainers.test.ts src/features/legend/components/NodeContainerLegend && npm run typecheck`
Expected: deriveContainers test PASS; typecheck will FAIL until KsgPanel is updated (Task 11) — that is expected; do not commit yet.

### Task 11: Wire KsgPanel — segmented control, default-collapse, mode-aware containers

**Files:**

- Modify: `src/panels/KsgPanel/KsgPanel.tsx`

- [ ] **Step 1: Replace the toggle with the segmented control + default-collapse**

In `src/panels/KsgPanel/KsgPanel.tsx`:

1. Imports: add `LayoutModeControl` to the legend import; import `useEffect`; replace `deriveNodeContainers` with `deriveContainers`.

2. Replace the `togglePodParentMode` callback with a setter passed to the control, and add the default-collapse effect:

```tsx
const [podParentMode, setPodParentMode] = useState<PodParentMode>('node');
const elements = useMemo(() => applyPodParentMode(baseElements, podParentMode), [baseElements, podParentMode]);
```

3. Replace the `deriveNodeContainers(...)` call:

```tsx
const {
  containerEntries,
  containerIds,
  title: containerTitle,
  collapseNoun,
  showNodeKindIcon,
} = useMemo(
  () => deriveContainers(elements, themeColors(theme).border.weak, podParentMode, collapsedIds),
  [elements, theme, podParentMode, collapsedIds]
);
```

and update the node collapse group to use `containerIds`:

```tsx
const { allCollapsed: allNodesCollapsed, toggle: toggleNodes } = useCollapseGroup(
  containerIds,
  collapsedIds,
  setCollapsedIds
);
```

4. Add the default-collapse-on-entry effect (after `collapsedIds` state is declared). It must run only on a transition INTO controller mode, and must add the controllers PRESENT in that mode:

```tsx
// Entering controller mode aggregates pods: default-collapse every controller
// container on each entry (re-collapse-all even after a prior expand). Controller
// ids are taken from the current (controller-mode) elements. Switching back to
// node mode prunes them via reconcileCollapse, so this only fires on entry.
const prevModeRef = React.useRef<PodParentMode>(podParentMode);
useEffect(() => {
  const entered = prevModeRef.current !== 'controller' && podParentMode === 'controller';
  prevModeRef.current = podParentMode;
  if (!entered) {
    return;
  }
  const controllerIds = elements
    .filter((el) => el.group === 'nodes' && (el.data as cytoscape.NodeDataDefinition).isController === true)
    .map((el) => (el.data as cytoscape.NodeDataDefinition).id)
    .filter((id): id is string => typeof id === 'string');
  setCollapsedIds((prev) => new Set([...prev, ...controllerIds]));
}, [podParentMode, elements]);
```

5. In the legend JSX, render `LayoutModeControl` FIRST (top of legend), pass the segmented setter, give NodeContainerLegend the mode-aware title/noun + entries, and drop the EdgeLegend `mode`/`onToggleMode` props:

```tsx
<aside className={styles.legendArea}>
  <LayoutModeControl mode={podParentMode} onChange={setPodParentMode} />
  <ClusterLegend clusters={clusterEntries} onToggleCollapseAll={toggleClusters} allCollapsed={allClustersCollapsed} />
  <NodeContainerLegend
    nodes={containerEntries}
    onToggleCollapseAll={toggleNodes}
    allCollapsed={allNodesCollapsed}
    title={containerTitle}
    collapseNoun={collapseNoun}
  />
  <NodeLegend kinds={nodeLegendKinds} />
  <EdgeLegend edgeTypes={presentEdgeTypes} />
  <StatusLegend />
</aside>
```

(`nodeLegendKinds` already keys off `showNodeKindIcon`, which `deriveContainers` now returns mode-aware.)

- [ ] **Step 2: Run typecheck + KsgPanel tests**

Run: `npm run typecheck && npx jest src/panels/KsgPanel`
Expected: PASS. Update KsgPanel tests that referenced the old toggle / `deriveNodeContainers` name.

- [ ] **Step 3: Update the useCytoscape comment (no logic change)**

In `src/features/graph-canvas/hooks/useCytoscape.ts`, update the `podParentMode` doc comment (lines ~24-28, ~107) wording from "node/service containers" to "node/controller containers". The rebuild branch is already mode-agnostic.

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:ci && npm run lint`
Expected: PASS, zero lint warnings.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(panel): LayoutModeControl wiring, controller default-collapse, mode-aware containers"
```

---

## Phase 6 — Doc-comments, demo, full verification

### Task 12: Rewrite stale service-mode doc-comments

**Files:**

- Modify: `src/shared/constants/colorByEdgeType.ts`, `src/shared/constants/drawnEdgeTypesForMode.ts`, `src/shared/constants/types.ts`

- [ ] **Step 1: Update comments only** (no behaviour change)

- In `colorByEdgeType.ts`: the comment "`pod-runs-on-node` only appears as a drawn edge in `service` pod-parent mode" → "...in `controller` pod-parent mode"; remove "node→switch is a distinct indigo direct uplink" (now shares the fabric colour).
- In `drawnEdgeTypesForMode.ts`: the header comment describing `service` mode → describe `controller` mode (pod nests in its controller; `controller-owns-pod` becomes nesting; `pod-runs-on-node` is the drawn edge).
- In `types.ts`: confirm the `PodParentMode` comment already updated in Task 4.

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/constants/
git commit -m "docs: update service-mode doc-comments to controller-mode semantics"
```

### Task 13: Full verification + demo

- [ ] **Step 1: Run the gate**

Run: `npm run typecheck && npm run lint && npm run test:ci && npm run build`
Expected: all PASS, zero warnings, build succeeds.

- [ ] **Step 2: Validate the OpenSpec change**

Run: `npx openspec validate icon-encoding-workload-topology --strict`
Expected: "is valid".

- [ ] **Step 3: Demo manual check** (`npm run build` already done; `docker compose up -d`)

Open http://localhost:3000 → KSG Demo. Verify:

- Legend top shows `Layout: [Node|Controller]`; default Node.
- Switch to Controller → pods aggregate under controllers (all collapsed); NodeContainerLegend titled "Controllers"; expanding a controller reveals its pods.
- `node-to-switch` renders cyan + orthogonal (same as `switch-to-switch`).
- With the seeded switch fabric, controller mode shows `pod → node → switch → switch` top-to-bottom; switching back to Node restores `cluster>node>pod`.

- [ ] **Step 4: Mark tasks complete in the OpenSpec change**

Check off the corresponding boxes in `openspec/changes/icon-encoding-workload-topology/tasks.md` (groups 2.7/2.8, 4.5, 5, 6, 7.2/7.4, 8, 9, 10, 12.x).

---

## Self-Review notes

- **Spec coverage:** D9 synthesis → Task 3; D10 segmented control top-of-legend → Task 9/11; D11 default-collapse → Task 11; D12 fabric tier + node-to-switch → Tasks 7/8; EdgeType 8 + drawn sets → Tasks 1/5; NodeContainerLegend mode-aware → Task 10/11; controller-reparent original-parent-must-be-node → Task 4.
- **Type consistency:** `deriveContainers` (Task 10) replaces `deriveNodeContainers`; the only caller (KsgPanel, Task 11) is updated in the same phase. `PodParentMode` flips in Task 4 and every consumer is updated by end of Phase 3 (Task 6). `isController` (Task 2) is set in Task 3 and read in Tasks 4/10/11.
- **No placeholders:** every code step shows full code; commands have expected output.
