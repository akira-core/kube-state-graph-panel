import type cytoscape from 'cytoscape';
import { useEffect } from 'react';

const DEBOUNCE_MS = 100;
const FIT_PADDING = 24;

export interface UseGraphResizeProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function useGraphResize({ cyRef, containerRef }: UseGraphResizeProps): void {
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        const cy = cyRef.current;
        if (cy === null) {
          return;
        }
        cy.resize();
        cy.fit(undefined, FIT_PADDING);
      }, DEBOUNCE_MS);
    });
    observer.observe(container);
    return (): void => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      observer.disconnect();
    };
  }, [cyRef, containerRef]);
}
