import { render } from '@testing-library/react';
import React from 'react';

import { EdgeGlyph } from './EdgeGlyph';

describe('EdgeGlyph', () => {
  it('renders a line and arrowhead in the given colour', () => {
    const { getByTestId } = render(<EdgeGlyph color="#f97316" lineStyle="solid" />);
    const svg = getByTestId('edge-glyph');
    expect(svg.querySelector('line')?.getAttribute('stroke')).toBe('#f97316');
    expect(svg.querySelector('polygon')?.getAttribute('fill')).toBe('#f97316');
  });

  it('applies a dash pattern for dashed/dotted but not solid', () => {
    const { getByTestId, rerender } = render(<EdgeGlyph color="#10b981" lineStyle="dashed" />);
    expect(getByTestId('edge-glyph').querySelector('line')?.getAttribute('stroke-dasharray')).not.toBeNull();
    rerender(<EdgeGlyph color="#10b981" lineStyle="dotted" />);
    expect(getByTestId('edge-glyph').querySelector('line')?.getAttribute('stroke-dasharray')).not.toBeNull();
    rerender(<EdgeGlyph color="#10b981" lineStyle="solid" />);
    expect(getByTestId('edge-glyph').querySelector('line')?.getAttribute('stroke-dasharray')).toBeNull();
  });
});
