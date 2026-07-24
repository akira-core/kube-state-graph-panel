import type { PanelOptionsEditorBuilder, StandardEditorProps } from '@grafana/data';
import { render } from '@testing-library/react';
import React from 'react';

// MultiSelect is the only @grafana/ui import in the editor; stub it to capture the
// props the custom editors hand it (real MultiSelect needs a DOM portal + theme we
// don't want here). Name is mock-prefixed so jest's hoisted factory may reference it.
interface MultiSelectCall {
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string[] | undefined;
  onChange: (items: ReadonlyArray<{ value: string }>) => void;
}
const mockMultiSelectCalls: MultiSelectCall[] = [];
jest.mock('@grafana/ui', () => ({
  MultiSelect: (props: MultiSelectCall): null => {
    mockMultiSelectCalls.push(props);
    return null;
  },
}));

import { buildKsgPanelOptions } from './KsgPanel.editor';
import { ALL_EDGE_TYPES, ALL_KINDS, defaultOptions } from './KsgPanel.types';

// The real PanelOptionsEditorBuilder cannot run in jest: addRadio/addBooleanSwitch/
// addTextInput resolve their control from standardEditorsRegistry, which is never
// initialised in this env (it throws `"radio" not found in:`). A fake recording
// builder captures each registered option's config instead. addCustomEditor does not
// touch the registry, so the captured editors are the real components.
interface RecordedItem {
  method: string;
  config: Record<string, unknown>;
}

function createFakeBuilder(): { items: RecordedItem[]; builder: PanelOptionsEditorBuilder<never> } {
  const items: RecordedItem[] = [];
  const record =
    (method: string) =>
    (config: Record<string, unknown>): unknown => {
      items.push({ method, config });
      return builder;
    };
  const builder = {
    addRadio: record('addRadio'),
    addBooleanSwitch: record('addBooleanSwitch'),
    addCustomEditor: record('addCustomEditor'),
    addTextInput: record('addTextInput'),
  } as unknown as PanelOptionsEditorBuilder<never>;
  return { items, builder };
}

const buildItems = (): RecordedItem[] => {
  const { items, builder } = createFakeBuilder();
  buildKsgPanelOptions(builder as unknown as PanelOptionsEditorBuilder<typeof defaultOptions>);
  return items;
};

const itemByPath = (items: RecordedItem[], path: string): RecordedItem | undefined =>
  items.find((i) => i.config.path === path);

describe('buildKsgPanelOptions', () => {
  it('registers exactly one option per KsgPanelOptions key (no missing / stray control)', () => {
    const items = buildItems();
    const paths = items.map((i) => i.config.path as string).sort();
    expect(paths).toEqual(Object.keys(defaultOptions).sort());
  });

  it("each registered option's defaultValue matches defaultOptions (no editor/types drift)", () => {
    const items = buildItems();
    for (const key of Object.keys(defaultOptions)) {
      const item = itemByPath(items, key);
      expect(item?.config.defaultValue).toEqual(defaultOptions[key as keyof typeof defaultOptions]);
    }
  });

  it('the layout radio offers exactly the fcose / dagre choices (in sync with the layout union)', () => {
    const items = buildItems();
    const layout = itemByPath(items, 'layout');
    const settings = layout?.config.settings as { options: ReadonlyArray<{ value: string }> };
    expect(settings.options.map((o) => o.value)).toEqual(['fcose', 'dagre']);
  });

  it('showIngress registers as a boolean switch defaulting to visible', () => {
    const items = buildItems();
    const item = itemByPath(items, 'showIngress');
    expect(item?.method).toBe('addBooleanSwitch');
    expect(item?.config.defaultValue).toBe(true);
  });

  it('the two multi-select options are custom editors with id === path and a function editor', () => {
    const items = buildItems();
    for (const path of ['visibleKinds', 'visibleEdgeTypes']) {
      const item = itemByPath(items, path);
      expect(item?.method).toBe('addCustomEditor');
      expect(item?.config.id).toBe(path);
      expect(typeof item?.config.editor).toBe('function');
    }
  });
});

// Render the captured custom editors against the mocked MultiSelect to pin the
// option-list derivation and the SelectableValue[] → value[] onChange mapping.
type MultiEditor = React.ComponentType<StandardEditorProps<string[]>>;

const renderEditor = (path: string, value: string[] | undefined, onChange: jest.Mock): MultiSelectCall => {
  const Editor = itemByPath(buildItems(), path)?.config.editor as MultiEditor;
  render(<Editor {...({ value, onChange } as unknown as StandardEditorProps<string[]>)} />);
  const call = mockMultiSelectCalls.at(-1);
  if (call === undefined) {
    throw new Error('MultiSelect was not rendered');
  }
  return call;
};

describe('KsgPanel.editor multi-select editors', () => {
  beforeEach(() => {
    mockMultiSelectCalls.length = 0;
  });

  it('derives the kinds editor options as one {value,label} per ALL_KINDS entry (label === value)', () => {
    const call = renderEditor('visibleKinds', [], jest.fn());
    expect(call.options).toEqual(ALL_KINDS.map((v) => ({ value: v, label: v })));
  });

  it('derives the edge-types editor options as one {value,label} per ALL_EDGE_TYPES entry', () => {
    const call = renderEditor('visibleEdgeTypes', [], jest.fn());
    expect(call.options).toEqual(ALL_EDGE_TYPES.map((v) => ({ value: v, label: v })));
  });

  it('passes the inbound value array straight through to MultiSelect untransformed', () => {
    const call = renderEditor('visibleEdgeTypes', ['pod-calls-pod'], jest.fn());
    expect(call.value).toEqual(['pod-calls-pod']);
  });

  it('maps the selected SelectableValue[] back to a plain value[] on change', () => {
    const onChange = jest.fn();
    const call = renderEditor('visibleKinds', [], onChange);
    call.onChange([{ value: 'pod' }, { value: 'node' }]);
    expect(onChange).toHaveBeenCalledWith(['pod', 'node']);
  });

  it('maps an empty selection to an empty array (clear all, no crash)', () => {
    const onChange = jest.fn();
    const call = renderEditor('visibleKinds', ['pod'], onChange);
    call.onChange([]);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
