import type cytoscape from 'cytoscape';

export interface ElementDiff {
  toAdd: cytoscape.ElementDefinition[];
  toRemove: string[];
  toUpdate: cytoscape.ElementDefinition[];
}

function elementId(el: cytoscape.ElementDefinition): string {
  return el.data.id ?? '';
}

// cytoscape's removeData() sets a field to undefined rather than deleting the key,
// so a live element's jsons() can carry `{ alerts: undefined }` tombstones. JSON-wise
// a tombstone IS absence: compare only DEFINED keys, or an element whose key was
// removed would mismatch an incoming definition that omits it on every diff cycle.
function definedKeys(o: cytoscape.ElementDataDefinition): string[] {
  const rec = o as Record<string, unknown>;
  return Object.keys(rec).filter((k) => rec[k] !== undefined);
}

function shallowEqualData(a: cytoscape.ElementDataDefinition, b: cytoscape.ElementDataDefinition): boolean {
  const keysA = definedKeys(a);
  const keysB = definedKeys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const k of keysA) {
    const av = (a as Record<string, unknown>)[k];
    const bv = (b as Record<string, unknown>)[k];
    if (av === bv) {
      continue;
    }
    if (typeof av === 'object' && typeof bv === 'object' && av !== null && bv !== null) {
      if (JSON.stringify(av) !== JSON.stringify(bv)) {
        return false;
      }
      continue;
    }
    return false;
  }
  return true;
}

export function diffElements(current: cytoscape.ElementDefinition[], next: cytoscape.ElementDefinition[]): ElementDiff {
  const currentById = new Map<string, cytoscape.ElementDefinition>();
  for (const el of current) {
    const id = elementId(el);
    if (id) {
      currentById.set(id, el);
    }
  }

  const nextIds = new Set<string>();
  const toAdd: cytoscape.ElementDefinition[] = [];
  const toUpdate: cytoscape.ElementDefinition[] = [];

  for (const el of next) {
    const id = elementId(el);
    if (!id) {
      continue;
    }
    nextIds.add(id);
    const existing = currentById.get(id);
    if (existing === undefined) {
      toAdd.push(el);
    } else if (!shallowEqualData(existing.data, el.data)) {
      toUpdate.push(el);
    }
  }

  const toRemove: string[] = [];
  for (const id of currentById.keys()) {
    if (!nextIds.has(id)) {
      toRemove.push(id);
    }
  }

  return { toAdd, toRemove, toUpdate };
}
