import cytoscape from 'cytoscape';

import { registerCytoscapeExtensions } from './registerExtensions';

describe('registerCytoscapeExtensions', () => {
  it('registers each extension once at import and re-registration is a guarded no-op', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cy = require('cytoscape') as typeof import('cytoscape');
      const useSpy = jest.spyOn(cy, 'use');
      // Requiring the module runs its module-level registerCytoscapeExtensions().
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./registerExtensions') as typeof import('./registerExtensions');
      expect(useSpy).toHaveBeenCalledTimes(3); // fcose, dagre, expand-collapse
      mod.registerCytoscapeExtensions(); // guard → no further use() calls
      expect(useSpy).toHaveBeenCalledTimes(3);
    });
  });

  it('exposes cy.expandCollapse after registration', () => {
    // Explicitly register on the outer cytoscape instance used in this test.
    // (SWC strips unused named imports so we cannot rely on the import side-effect alone.)
    registerCytoscapeExtensions();
    // cy.expandCollapse is typed via the Core augmentation in src/shared/types/cytoscape.d.ts
    // which is included by tsconfig.test.json (src/**/*) — no cast needed.
    const cy = cytoscape({ headless: true });
    expect(typeof cy.expandCollapse).toBe('function');
    cy.destroy();
  });
});
