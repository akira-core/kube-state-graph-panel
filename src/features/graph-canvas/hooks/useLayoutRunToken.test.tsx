import { renderHook } from '@testing-library/react';

import type { PodParentMode } from '../../../shared/constants/types';

import { useLayoutRunToken } from './useLayoutRunToken';

interface Props {
  collapsedIds?: Set<string>;
  podParentMode?: PodParentMode;
}

const setup = (initial: Props) => renderHook((props: Props) => useLayoutRunToken(props), { initialProps: initial });

describe('useLayoutRunToken', () => {
  it('starts at 0 on mount', () => {
    const { result } = setup({});
    expect(result.current).toBe(0);
  });

  it('bumps when collapsed-id content changes', () => {
    const { result, rerender } = setup({ collapsedIds: new Set() });
    const before = result.current;
    rerender({ collapsedIds: new Set(['cl']) });
    expect(result.current).toBe(before + 1);
  });

  it('does not bump when collapsed-id content is unchanged (new Set, same members)', () => {
    const { result, rerender } = setup({ collapsedIds: new Set(['a', 'b']) });
    const before = result.current;
    rerender({ collapsedIds: new Set(['b', 'a']) });
    expect(result.current).toBe(before);
  });

  it('bumps when podParentMode changes', () => {
    const { result, rerender } = setup({ podParentMode: 'node' });
    const before = result.current;
    rerender({ podParentMode: 'controller' });
    expect(result.current).toBe(before + 1);
  });

  it('does not bump when nothing changes', () => {
    const { result, rerender } = setup({ collapsedIds: new Set(['a']), podParentMode: 'node' });
    const before = result.current;
    rerender({ collapsedIds: new Set(['a']), podParentMode: 'node' });
    expect(result.current).toBe(before);
  });
});
