import { render } from '@testing-library/react';
import React from 'react';

import { ShapeGlyph } from './ShapeGlyph';

describe('ShapeGlyph', () => {
  it('renders an svg keyed by the shape name', () => {
    const { getByTestId } = render(<ShapeGlyph shape="pentagon" />);
    expect(getByTestId('shape-glyph-pentagon').tagName.toLowerCase()).toBe('svg');
  });

  it('is square — equal width and height — regardless of shape', () => {
    const { getByTestId } = render(<ShapeGlyph shape="star" size={24} />);
    const svg = getByTestId('shape-glyph-star');
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
  });

  it('uses a circle for ellipse and a polygon for star', () => {
    const { getByTestId, rerender } = render(<ShapeGlyph shape="ellipse" />);
    expect(getByTestId('shape-glyph-ellipse').querySelector('circle')).not.toBeNull();
    rerender(<ShapeGlyph shape="star" />);
    expect(getByTestId('shape-glyph-star').querySelector('polygon')).not.toBeNull();
  });

  it('honours explicit fill/stroke overrides', () => {
    const { getByTestId } = render(<ShapeGlyph shape="diamond" fill="#123456" stroke="#abcdef" />);
    const poly = getByTestId('shape-glyph-diamond').querySelector('polygon');
    expect(poly?.getAttribute('fill')).toBe('#123456');
    expect(poly?.getAttribute('stroke')).toBe('#abcdef');
  });
});
