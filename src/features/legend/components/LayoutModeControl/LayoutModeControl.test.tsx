import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { LayoutModeControl } from './LayoutModeControl';

it('renders a Node|Controller segmented control and reports changes', () => {
  const onChange = jest.fn();
  render(<LayoutModeControl mode="node" onChange={onChange} />);
  expect(screen.getByText('Layout')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Controller'));
  expect(onChange).toHaveBeenCalledWith('controller');
});
