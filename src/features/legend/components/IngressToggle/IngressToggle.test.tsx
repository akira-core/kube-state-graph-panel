import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { IngressToggle } from './IngressToggle';

describe('IngressToggle', () => {
  it('shows the eye (Hide) affordance while visible', () => {
    render(<IngressToggle visible={true} onToggle={jest.fn()} />);
    expect(screen.getByTestId('ingress-toggle')).toHaveTextContent('Ingress gateway');
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
});
