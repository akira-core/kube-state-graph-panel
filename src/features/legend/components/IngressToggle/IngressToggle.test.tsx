import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { INGRESS_DASH_COLOR, INGRESS_DASH_PATTERN } from '../../../../shared/constants/colorByEdgeType';

import { IngressToggle } from './IngressToggle';

describe('IngressToggle', () => {
  it('shows the eye (Hide) affordance while visible', () => {
    render(<IngressToggle visible={true} onToggle={jest.fn()} />);
    expect(screen.getByTestId('ingress-toggle')).toHaveTextContent('Ingress Gateway');
    expect(screen.getByRole('button', { name: 'Hide ingress gateway' })).toBeInTheDocument();
  });

  it('flips to the eye-slash (Show) affordance while hidden', () => {
    render(<IngressToggle visible={false} onToggle={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Show ingress gateway' })).toBeInTheDocument();
  });

  it('reports a click through onToggle', () => {
    const onToggle = jest.fn();
    render(<IngressToggle visible={true} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('ingress-toggle-button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders a dashed-line key matching the on-canvas ingress stroke', () => {
    render(<IngressToggle visible={true} onToggle={jest.fn()} />);
    const glyph = screen.getByTestId('edge-glyph');
    expect(screen.getByText('dashed = via gateway')).toBeInTheDocument();
    // Colour + dash rhythm come from the same constants the stylesheet's
    // `edge[?ingressPath]` rule uses, so the key describes strokes that really appear.
    expect(glyph.querySelector('line')?.getAttribute('stroke')).toBe(INGRESS_DASH_COLOR);
    expect(glyph.querySelector('line')?.getAttribute('stroke-dasharray')).toBe(INGRESS_DASH_PATTERN.join(' '));
  });
});
