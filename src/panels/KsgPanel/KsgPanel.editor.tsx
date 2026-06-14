import type { PanelOptionsEditorBuilder, StandardEditorProps } from '@grafana/data';
import { MultiSelect } from '@grafana/ui';
import React from 'react';

import type { EdgeType, NodeKind } from '../../shared/constants/types';

import { ALL_EDGE_TYPES, ALL_KINDS, defaultOptions, type KsgPanelOptions } from './KsgPanel.types';

type StringArrayEditorProps<T extends string> = StandardEditorProps<T[]>;

function makeMultiEditor<T extends string>(allValues: readonly T[]) {
  return function MultiEditor(props: Readonly<StringArrayEditorProps<T>>): React.JSX.Element {
    const { value, onChange } = props;
    const options = allValues.map((v) => ({ value: v, label: v }));
    return (
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox lacks stable multi-select; MultiSelect remains the supported API
      <MultiSelect
        options={options}
        value={value}
        onChange={(items) => {
          onChange(items.map((i) => i.value as T));
        }}
      />
    );
  };
}

const KindsEditor = makeMultiEditor<NodeKind>(ALL_KINDS);
const EdgeTypesEditor = makeMultiEditor<EdgeType>(ALL_EDGE_TYPES);

export function buildKsgPanelOptions(
  builder: PanelOptionsEditorBuilder<KsgPanelOptions>
): PanelOptionsEditorBuilder<KsgPanelOptions> {
  return builder
    .addRadio({
      path: 'layout',
      name: 'Layout algorithm',
      defaultValue: defaultOptions.layout,
      settings: {
        options: [
          { value: 'fcose', label: 'fcose (force-directed)' },
          { value: 'dagre', label: 'dagre (hierarchical)' },
        ],
      },
    })
    .addBooleanSwitch({
      path: 'showLegend',
      name: 'Show legend',
      defaultValue: defaultOptions.showLegend,
    })
    .addCustomEditor({
      id: 'visibleKinds',
      path: 'visibleKinds',
      name: 'Visible node types',
      description: 'Resource kinds shown in the graph. Hidden kinds keep their position but are not rendered.',
      defaultValue: defaultOptions.visibleKinds,
      editor: KindsEditor,
    })
    .addCustomEditor({
      id: 'visibleEdgeTypes',
      path: 'visibleEdgeTypes',
      name: 'Visible edge types',
      description: 'Relationship types shown in the graph. Edges with a hidden endpoint are auto-hidden.',
      defaultValue: defaultOptions.visibleEdgeTypes,
      editor: EdgeTypesEditor,
    })
    .addTextInput({
      path: 'detailEndpoint',
      name: 'Detail URL endpoint',
      description:
        'Overrides the base the node-detail Application/Containers URL lookups append their ' +
        '/config_changes and /code_changes segments to. Leave empty to derive it from the dashboard ' +
        'query so the detail endpoints resolve as siblings of the graph query (the datasource ' +
        'proxy path /api/datasources/proxy/uid/<uid> plus the graph query directory, e.g. a query ' +
        'at .../api/v1/graph/service_graph yields .../api/v1/graph/config_changes). ' +
        'If neither resolves, the URL buttons stay disabled and no lookup is issued.',
      defaultValue: defaultOptions.detailEndpoint,
    })
    .addTextInput({
      path: 'podListVariable',
      name: 'Pod list variable',
      description:
        'Name of an existing dashboard variable to export the pod names of the graph into ' +
        '(multi-value), e.g. for an Elasticsearch logs panel querying ${pod_list:lucene}. ' +
        'A successfully loaded graph with zero pods writes the $__empty sentinel (consumers ' +
        'match no pod) — query errors and payload-less refreshes leave the variable untouched. ' +
        'The variable must already exist on the dashboard and must not feed back into ' +
        "this panel's own query. Leave empty to disable.",
      defaultValue: defaultOptions.podListVariable,
    });
}
