import cytoscape from 'cytoscape';
import { useEffect, useMemo, useRef, useState } from 'react';

import { diffElements } from '../sync/diffElements';

export type CyStylesheet = cytoscape.StylesheetStyle | cytoscape.StylesheetCSS;

export interface UseCytoscapeProps {
  elements: cytoscape.ElementDefinition[];
  stylesheet: CyStylesheet[];
}

export interface UseCytoscapeReturn {
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  // Flips to true once the instance exists. cyRef is a ref (no re-render on set),
  // so a child effect that binds cy listeners (e.g. hover) would run before the
  // instance is created — children's effects fire before the parent's init
  // effect — and never re-run. Consumers depend on isReady to (re)bind correctly.
  isReady: boolean;
}

// Use 'preset' on init so cytoscape does not auto-run a layout.
// useGraphLayout is the single source of layout execution.
const INIT_LAYOUT: cytoscape.LayoutOptions = { name: 'preset' };

export function useCytoscape({ elements, stylesheet }: UseCytoscapeProps): UseCytoscapeReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Init / destroy
  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }
    cyRef.current = cytoscape({
      container: containerRef.current,
      elements,
      style: stylesheet,
      layout: INIT_LAYOUT,
    });
    setIsReady(true);
    return (): void => {
      setIsReady(false);
      if (cyRef.current !== null) {
        cyRef.current.removeAllListeners();
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
    // Init effect intentionally runs once — element/style/layout updates handled by dedicated effects below.
    // oxlint-disable-next-line react-doctor/exhaustive-deps -- single-shot init; subsequent updates handled by other effects
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- single-shot init; subsequent updates handled by other effects

  // Elements diff-and-patch
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    const current = cy.elements().jsons() as cytoscape.ElementDefinition[];
    const diff = diffElements(current, elements);
    if (diff.toAdd.length === 0 && diff.toRemove.length === 0 && diff.toUpdate.length === 0) {
      return;
    }
    cy.batch(() => {
      if (diff.toRemove.length > 0) {
        cy.remove(diff.toRemove.map((id) => `#${id}`).join(', '));
      }
      if (diff.toAdd.length > 0) {
        cy.add(diff.toAdd);
      }
      for (const el of diff.toUpdate) {
        const target = cy.getElementById(el.data.id ?? '');
        if (target.length > 0) {
          target.data(el.data);
        }
      }
    });
  }, [elements]);

  // Stylesheet swap (no instance rebuild)
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    cy.style(stylesheet).update();
  }, [stylesheet]);

  return useMemo(() => ({ containerRef, cyRef, isReady }), [containerRef, cyRef, isReady]);
}
