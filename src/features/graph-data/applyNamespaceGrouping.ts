import type cytoscape from 'cytoscape';

import { colorForNamespace } from '../../shared/constants/namespacePalette';
import type { NodeKind, PodParentMode } from '../../shared/constants/types';

// Fresh-clone an element's data — cytoscape ALIASES the data object on cy.add and the
// expand-collapse extension mutates incident edges' data in place (see
// applyPodParentMode's cloneElement). Every returned element is a new object so this
// pass never corrupts the normalized / pod-parent-applied input.
function cloneElement(el: cytoscape.ElementDefinition): cytoscape.ElementDefinition {
  return { ...el, data: { ...el.data } };
}

// Opaque, deterministic ids for the panel-synthesized boxes. Built from the REAL
// container ids (which the panel never parses — it only joins them as an opaque key)
// plus the namespace / storageclass NAMES, not from guessed backend naming. The
// prefixes keep them clear of backend ids in practice.
function namespaceBoxId(clusterId: string, ns: string): string {
  return `nsbox/${clusterId}/${ns}`;
}
function storageClassSubBoxId(nsBoxId: string, sc: string): string {
  return `scbox/${nsBoxId}/${sc}`;
}

/**
 * Insert virtual namespace compound parents — CONTROLLER MODE ONLY.
 *
 * Composed AFTER applyPodParentMode and BEFORE wrapSwitchFabric. In controller mode
 * the namespaced resources are already parented to their cluster (controllers,
 * services) or to a backend storageclass box (pvcs), so this pass groups them under a
 * per-cluster `(cluster, namespace)` box:
 *   - cluster → namespace → controller → pod   (pod stays nested in its controller)
 *   - cluster → namespace → service
 *   - cluster → namespace → storageclass → pvc (the backend storageclass box is SPLIT
 *       per namespace; an original emptied by the split is removed), or
 *     cluster → namespace → pvc                (when the pvc had no storageclass box)
 *
 * `node` mode is a no-op — it returns a fresh, semantically-equal array (k8s nodes are
 * cluster-scoped, so node mode draws no namespace).
 *
 * Pure / deterministic / immutable: the input is never mutated; every returned element
 * is a fresh object; synthesized boxes are appended in a stable order (by container id,
 * then name); namespace colours come from a stable hash of the namespace name.
 */
export function applyNamespaceGrouping(
  elements: cytoscape.ElementDefinition[],
  mode: PodParentMode
): cytoscape.ElementDefinition[] {
  if (mode === 'node') {
    return elements.map(cloneElement);
  }

  // Index node elements by id for topology lookups (parent chains, kind/flag checks).
  const byId = new Map<string, Record<string, unknown>>();
  for (const el of elements) {
    if (el.group === 'nodes') {
      const d = el.data as Record<string, unknown>;
      if (typeof d.id === 'string') {
        byId.set(d.id, d);
      }
    }
  }

  // Walk the parent chain up to the enclosing cluster container id (isCluster), or
  // undefined when there is none (top-level / non-cluster ancestor → fallback).
  const clusterAncestorId = (data: Record<string, unknown>): string | undefined => {
    let cur = typeof data.parent === 'string' ? data.parent : undefined;
    for (let guard = 0; cur !== undefined && guard < 64; guard++) {
      const p = byId.get(cur);
      if (p === undefined) {
        return undefined;
      }
      if (p.isCluster === true) {
        return cur;
      }
      cur = typeof p.parent === 'string' ? p.parent : undefined;
    }
    return undefined;
  };

  const namespaceOf = (data: Record<string, unknown>): string =>
    typeof data.namespace === 'string' ? data.namespace : '';

  // Synthesized boxes, keyed for dedup; values carry what's needed to materialize them.
  const nsBoxes = new Map<string, { id: string; clusterId: string; namespace: string }>();
  const scSubBoxes = new Map<string, { id: string; nsBoxId: string; scName: string }>();
  const newParentById = new Map<string, string>();

  const ensureNsBox = (clusterId: string, namespace: string): string => {
    const id = namespaceBoxId(clusterId, namespace);
    if (!nsBoxes.has(id)) {
      nsBoxes.set(id, { id, clusterId, namespace });
    }
    return id;
  };
  const ensureScSubBox = (nsBoxId: string, scName: string): string => {
    const id = storageClassSubBoxId(nsBoxId, scName);
    if (!scSubBoxes.has(id)) {
      scSubBoxes.set(id, { id, nsBoxId, scName });
    }
    return id;
  };

  // Per backend storageclass box: total child pvcs vs how many got re-parented out (had
  // a namespace + resolvable cluster). A box whose pvcs ALL moved is removed so no
  // childless storageclass container lingers; one with namespace-less pvcs is kept.
  const scBoxPvcTotal = new Map<string, number>();
  const scBoxPvcReparented = new Map<string, number>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as Record<string, unknown>;
    if (d.kind === 'pvc' && typeof d.parent === 'string') {
      const p = byId.get(d.parent);
      if (p?.isStorageClass === true) {
        scBoxPvcTotal.set(d.parent, (scBoxPvcTotal.get(d.parent) ?? 0) + 1);
      }
    }
  }

  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as Record<string, unknown>;
    const id = typeof d.id === 'string' ? d.id : undefined;
    if (id === undefined) {
      continue;
    }
    const namespace = namespaceOf(d);
    if (namespace === '') {
      continue; // fallback: no namespace → not grouped
    }

    // Controllers & services: re-parent under the (cluster, namespace) box.
    if (d.isController === true || d.kind === 'service') {
      const clusterId = clusterAncestorId(d);
      if (clusterId === undefined) {
        continue; // no cluster ancestor → fallback
      }
      newParentById.set(id, ensureNsBox(clusterId, namespace));
      continue;
    }

    // PVCs: cluster → namespace → storageclass → pvc (splitting the backend sc box per
    // namespace), or cluster → namespace → pvc when there is no storageclass box.
    if (d.kind === 'pvc') {
      const parentId = typeof d.parent === 'string' ? d.parent : undefined;
      const parent = parentId !== undefined ? byId.get(parentId) : undefined;
      if (parentId !== undefined && parent?.isStorageClass === true) {
        const clusterId = clusterAncestorId(parent);
        if (clusterId === undefined) {
          continue; // storageclass box with no cluster ancestor → fallback
        }
        const nsBoxId = ensureNsBox(clusterId, namespace);
        const scName = typeof parent.label === 'string' ? parent.label : 'storage';
        newParentById.set(id, ensureScSubBox(nsBoxId, scName));
        scBoxPvcReparented.set(parentId, (scBoxPvcReparented.get(parentId) ?? 0) + 1);
      } else if (parentId !== undefined && parent?.isCluster === true) {
        newParentById.set(id, ensureNsBox(parentId, namespace));
      }
      // else: pvc parent is neither a storageclass box nor a cluster → fallback.
    }
  }

  // Backend storageclass boxes whose every child pvc was re-parented → remove.
  const removedScBoxIds = new Set<string>();
  for (const [scId, total] of scBoxPvcTotal) {
    if (total > 0 && (scBoxPvcReparented.get(scId) ?? 0) === total) {
      removedScBoxIds.add(scId);
    }
  }

  const result: cytoscape.ElementDefinition[] = [];
  for (const el of elements) {
    if (el.group === 'nodes') {
      const d = el.data as Record<string, unknown>;
      const id = typeof d.id === 'string' ? d.id : undefined;
      if (id !== undefined && removedScBoxIds.has(id)) {
        continue; // emptied backend storageclass box
      }
      const newParent = id !== undefined ? newParentById.get(id) : undefined;
      if (newParent !== undefined) {
        result.push({ ...el, data: { ...d, parent: newParent } });
        continue;
      }
    }
    result.push(cloneElement(el));
  }

  // Append synthesized namespace boxes (stable: clusterId, then namespace). Decorative
  // grouping backplates: selectable:false, no status / alerts / worstStatus.
  const sortedNs = [...nsBoxes.values()].sort(
    (a, b) => a.clusterId.localeCompare(b.clusterId) || a.namespace.localeCompare(b.namespace)
  );
  for (const box of sortedNs) {
    result.push({
      group: 'nodes',
      selectable: false,
      data: {
        id: box.id,
        label: box.namespace,
        isNamespace: true,
        namespace: box.namespace,
        namespaceColor: colorForNamespace(box.namespace),
        parent: box.clusterId,
      },
    });
  }

  // Append synthesized per-namespace storageclass sub-boxes (stable: nsBoxId, then sc
  // name). Same shape as a backend storageclass box: kind + isStorageClass, no status.
  const sortedSc = [...scSubBoxes.values()].sort(
    (a, b) => a.nsBoxId.localeCompare(b.nsBoxId) || a.scName.localeCompare(b.scName)
  );
  for (const box of sortedSc) {
    result.push({
      group: 'nodes',
      data: {
        id: box.id,
        label: box.scName,
        kind: 'storageclass' as NodeKind,
        isStorageClass: true,
        parent: box.nsBoxId,
      },
    });
  }

  return result;
}
