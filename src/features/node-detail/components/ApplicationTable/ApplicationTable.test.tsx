import { render, screen } from '@testing-library/react';
import React from 'react';

import { ApplicationTable } from './ApplicationTable';

describe('ApplicationTable', () => {
  it('renders the application name', () => {
    render(<ApplicationTable application="checkout" url={undefined} loading={false} error={undefined} />);
    expect(screen.getByTestId('application-row')).toBeInTheDocument();
    expect(screen.getByText('checkout')).toBeInTheDocument();
  });

  it('shows a loading indicator while the lookup is in flight (name still listed)', () => {
    render(<ApplicationTable application="checkout" url={undefined} loading={true} error={undefined} />);
    expect(screen.getByTestId('application-table-loading')).toBeInTheDocument();
    expect(screen.getByText('checkout')).toBeInTheDocument();
  });

  it('binds the button to the resolved URL as a new-tab noopener link, without auto-navigation', () => {
    const openSpy = jest.spyOn(window, 'open');
    render(<ApplicationTable application="checkout" url="https://argo/app/checkout" loading={false} error={undefined} />);
    const button = screen.getByTestId('application-url-button');
    expect(button).toHaveAttribute('href', 'https://argo/app/checkout');
    expect(button).toHaveAttribute('target', '_blank');
    expect(button).toHaveAttribute('rel', 'noopener');
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('disables the button when no URL is known (left-click / endpoint unset)', () => {
    render(<ApplicationTable application="checkout" url={undefined} loading={false} error={undefined} />);
    const button = screen.getByTestId('application-url-button');
    expect(button).not.toHaveAttribute('href');
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the error state while keeping the name visible', () => {
    render(<ApplicationTable application="checkout" url={undefined} loading={false} error="boom" />);
    expect(screen.getByTestId('application-table-error')).toHaveTextContent('boom');
    expect(screen.getByText('checkout')).toBeInTheDocument();
  });
});
