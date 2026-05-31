import { PanelPlugin } from '@grafana/data';

import './features/graph-canvas/registerExtensions';
import { KsgPanel, type KsgPanelOptions, buildKsgPanelOptions } from './panels/KsgPanel';

export const plugin = new PanelPlugin<KsgPanelOptions>(KsgPanel).setPanelOptions(buildKsgPanelOptions);
