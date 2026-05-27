import { render, act } from '@testing-library/react';
import cytoscape from 'cytoscape';
import React from 'react';

import { useCytoscape, type CyStylesheet } from './useCytoscape';

interface HarnessProps {
  elements: cytoscape.ElementDefinition[];
  stylesheet: CyStylesheet[];
  onReady?: (cy: cytoscape.Core) => void;
}

function Harness(props: Readonly<HarnessProps>): React.JSX.Element {
  const { elements, stylesheet, onReady } = props;
  const { containerRef, cyRef } = useCytoscape({ elements, stylesheet });
  React.useEffect(() => {
    if (cyRef.current !== null && onReady !== undefined) {
      onReady(cyRef.current);
    }
  });
  return <div ref={containerRef} style={{ width: 200, height: 200 }} data-testid="container" />;
}

const baseStylesheet: CyStylesheet[] = [{ selector: 'node', style: { 'background-color': '#000' } }];

describe('useCytoscape', () => {
  it('creates a cytoscape instance on mount and destroys it on unmount', () => {
    let capturedCy: cytoscape.Core | null = null;
    const { unmount } = render(
      <Harness
        elements={[{ group: 'nodes', data: { id: 'a' } }]}
        stylesheet={baseStylesheet}
        onReady={(cy): void => {
          capturedCy = cy;
        }}
      />
    );

    expect(capturedCy).not.toBeNull();
    const cy = capturedCy as unknown as cytoscape.Core;
    const destroySpy = jest.spyOn(cy, 'destroy');
    const removeAllSpy = jest.spyOn(cy, 'removeAllListeners');

    unmount();

    expect(removeAllSpy).toHaveBeenCalled();
    expect(destroySpy).toHaveBeenCalled();
  });

  it('init does not auto-run a layout extension (proves preset init layout)', () => {
    // If init used { name: 'fcose' }, cytoscape would throw "No such layout `fcose` found"
    // here because the extension is never registered in the jest environment.
    // A clean mount with no extension-missing error is the assertion.
    expect(() => {
      render(<Harness elements={[{ group: 'nodes', data: { id: 'a' } }]} stylesheet={baseStylesheet} />);
    }).not.toThrow();
  });

  it('applies element diffs without rebuilding the instance', () => {
    let capturedCy: cytoscape.Core | null = null;
    const onReady = (cy: cytoscape.Core): void => {
      capturedCy = cy;
    };
    const { rerender } = render(
      <Harness elements={[{ group: 'nodes', data: { id: 'a' } }]} stylesheet={baseStylesheet} onReady={onReady} />
    );

    const cyBefore = capturedCy;
    expect((cyBefore as unknown as cytoscape.Core).nodes().length).toBe(1);

    act(() => {
      rerender(
        <Harness
          elements={[
            { group: 'nodes', data: { id: 'a' } },
            { group: 'nodes', data: { id: 'b' } },
          ]}
          stylesheet={baseStylesheet}
          onReady={onReady}
        />
      );
    });

    expect(capturedCy).toBe(cyBefore); // same instance, not rebuilt
    expect((capturedCy as unknown as cytoscape.Core).nodes().length).toBe(2);
  });

  it('swaps stylesheet without rebuilding the instance', () => {
    let capturedCy: cytoscape.Core | null = null;
    const onReady = (cy: cytoscape.Core): void => {
      capturedCy = cy;
    };
    const { rerender } = render(<Harness elements={[]} stylesheet={baseStylesheet} onReady={onReady} />);

    const cyBefore = capturedCy as unknown as cytoscape.Core;
    const styleSpy = jest.spyOn(cyBefore, 'style');

    const nextStylesheet: CyStylesheet[] = [{ selector: 'node', style: { 'background-color': '#fff' } }];
    act(() => {
      rerender(<Harness elements={[]} stylesheet={nextStylesheet} onReady={onReady} />);
    });

    expect(capturedCy).toBe(cyBefore);
    expect(styleSpy).toHaveBeenCalledWith(nextStylesheet);
  });
});
