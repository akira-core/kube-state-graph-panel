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
      path: 'alertPodListVariable',
      name: 'Alert pod list variable',
      description:
        'Name of an existing dashboard variable to export the names of pods that CURRENTLY ' +
        'carry at least one alert into (multi-value) — any severity counts, e.g. for an ' +
        'Elasticsearch logs panel querying ${alert_pod_list:lucene}. A successfully loaded ' +
        'graph with zero alerting pods writes the $__empty sentinel — query errors and ' +
        "payload-less refreshes leave the variable untouched. BREAKING: replaces the old " +
        "'podListVariable' key, which exported ALL pods regardless of alerts — that key is " +
        'no longer read; existing dashboards must refill this option. Because the export can ' +
        'write many values at once, the target variable MUST be type Custom with Multi-value ' +
        'AND "Allow custom values" enabled (a plain textbox only holds one value). The ' +
        "variable must already exist on the dashboard and must not feed back into this panel's " +
        'own query. Leave empty to disable.',
      defaultValue: defaultOptions.alertPodListVariable,
    })
    .addTextInput({
      path: 'alertNameListVariable',
      name: 'Alert name list variable',
      description:
        'Name of an existing dashboard variable to export every distinct alert name present ' +
        'anywhere in the graph into (multi-value) — collected across ALL node kinds (pods, ' +
        'nodes, PVCs, services, controllers), for querying VictoriaMetrics by alertname. A ' +
        'successfully loaded graph with zero alerts writes the $__empty sentinel — query errors ' +
        'and payload-less refreshes leave the variable untouched. Independent of the alert pod ' +
        'list variable — either can be set alone, but each export option needs its OWN variable ' +
        '(two options writing the same name overwrite each other). Because the export can write ' +
        'many values at once, the target variable MUST be type Custom with Multi-value AND ' +
        '"Allow custom values" enabled (a plain textbox only holds one value). The variable ' +
        "must already exist on the dashboard and must not feed back into this panel's own " +
        'query. Leave empty to disable.',
      defaultValue: defaultOptions.alertNameListVariable,
    })
    .addTextInput({
      path: 'selectedPodVariable',
      name: 'Selected pod variable',
      description:
        'Name of an existing dashboard variable to write the LEFT-clicked pod name(s) into — any ' +
        'pod or controller click exports (status no longer gates this). Clicking a pod writes its ' +
        'single name; clicking a controller writes ALL of its direct child pod names as a ' +
        'MULTI-value write. Cleared ($__empty) on deselect or a click on any other node kind. ' +
        'Because a controller click can write multiple values, the target variable MUST be type ' +
        'Custom with Multi-value AND "Allow custom values" both enabled — a plain textbox variable ' +
        "only holds one value, and a Query/options variable would drop values outside its option " +
        "set. Do not reference it in this panel's own query. Leave empty to disable.",
      defaultValue: defaultOptions.selectedPodVariable,
    })
    .addTextInput({
      path: 'clusterVariable',
      name: 'Selected cluster variable',
      description:
        "Name of an existing dashboard variable to write the LEFT-clicked pod/controller's cluster " +
        'name into (single value), resolved from the nearest cluster group ancestor (fallback: the ' +
        "node's own cluster label). Cleared ($__empty) on deselect, a click on any other node kind, " +
        'or when cluster resolution fails. Independent of Selected pod variable — either can be set ' +
        "alone. Use a Textbox (or Custom + allow custom values) variable and do not reference it in " +
        "this panel's own query. Leave empty to disable.",
      defaultValue: defaultOptions.clusterVariable,
    });
}
