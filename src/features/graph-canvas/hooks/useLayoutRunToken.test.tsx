import { act, renderHook } from '@testing-library/react';

import type { PodParentMode } from '../../../shared/constants/types';

import { useLayoutRunToken } from './useLayoutRunToken';

interface Props {
  collapsedIds?: Set<string>;
  podParentMode?: PodParentMode;
}

const setup = (initial: Props) => renderHook((props: Props) => useLayoutRunToken(props), { initialProps: initial });

describe('useLayoutRunToken', () => {
  it('starts both tokens at 0 on mount', () => {
    const { result } = setup({});
    expect(result.current.contentToken).toBe(0);
    expect(result.current.layoutToken).toBe(0);
  });

  it('bumps BOTH tokens when collapsed-id content changes', () => {
    const { result, rerender } = setup({ collapsedIds: new Set() });
    const content = result.current.contentToken;
    const layout = result.current.layoutToken;
    rerender({ collapsedIds: new Set(['cl']) });
    expect(result.current.contentToken).toBe(content + 1);
    expect(result.current.layoutToken).toBe(layout + 1);
  });

  it('does not bump when collapsed-id content is unchanged (new Set, same members)', () => {
    const { result, rerender } = setup({ collapsedIds: new Set(['a', 'b']) });
    const content = result.current.contentToken;
    const layout = result.current.layoutToken;
    rerender({ collapsedIds: new Set(['b', 'a']) });
    expect(result.current.contentToken).toBe(content);
    expect(result.current.layoutToken).toBe(layout);
  });

  it('bumps BOTH tokens when podParentMode changes', () => {
    const { result, rerender } = setup({ podParentMode: 'node' });
    const content = result.current.contentToken;
    const layout = result.current.layoutToken;
    rerender({ podParentMode: 'controller' });
    expect(result.current.contentToken).toBe(content + 1);
    expect(result.current.layoutToken).toBe(layout + 1);
  });

  it('does not bump when nothing changes', () => {
    const { result, rerender } = setup({ collapsedIds: new Set(['a']), podParentMode: 'node' });
    const content = result.current.contentToken;
    const layout = result.current.layoutToken;
    rerender({ collapsedIds: new Set(['a']), podParentMode: 'node' });
    expect(result.current.contentToken).toBe(content);
    expect(result.current.layoutToken).toBe(layout);
  });

  it('requestRelayout bumps ONLY layoutToken, leaving contentToken untouched', () => {
    const { result } = setup({ collapsedIds: new Set(['a']) });
    const content = result.current.contentToken;
    const layout = result.current.layoutToken;
    act(() => {
      result.current.requestRelayout();
    });
    expect(result.current.layoutToken).toBe(layout + 1);
    expect(result.current.contentToken).toBe(content); // diff-patch gate unaffected
  });

  it('requestRelayout has a stable identity across renders', () => {
    const { result, rerender } = setup({ collapsedIds: new Set(['a']) });
    const first = result.current.requestRelayout;
    rerender({ collapsedIds: new Set(['a', 'b']) }); // a content bump
    expect(result.current.requestRelayout).toBe(first);
  });
});
