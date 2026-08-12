import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../../../shared/constants/types';
import type { VisibilitySets } from '../../../element-filter';
import type { PinnedTooltip } from '../../../hover-tooltip';
import type { CyStylesheet } from '../../hooks/useCytoscape';
import type { LayoutName } from '../../hooks/useGraphLayout';
import type { GraphViewportApi } from '../../hooks/useViewportApi';

export interface GraphCanvasProps {
  elements: cytoscape.ElementDefinition[];
  stylesheet: CyStylesheet[];
  layout: LayoutName;
  // Precomputed visibility (kind/edge filter + orphan cascade). Computed ONCE by
  // the panel — shared with its detail-panel gating — and applied here verbatim.
  visibility: VisibilitySets;
  onSelect?: (nodeId: string | null) => void;
  // Controlled selection: keeps cytoscape's single selection in sync (blue highlight) with
  // the detail panel, and drives the FOCUS fade (everything outside this node's 1-hop
  // neighbourhood dims) while no search query is active. It does NOT affect the miss fade
  // while searching — that is searchFocusNodeId's job. null/undefined clears the selection.
  selectedId?: string | null;
  // Compound-collapse integration. Optional → when omitted, GraphCanvas runs
  // without expand-collapse (backward compatible). collapsedIds is the set of
  // collapsed parent container ids; onCollapsedChange always receives the full
  // next Set (not a delta).
  collapsedIds?: Set<string>;
  onCollapsedChange?: (next: Set<string>) => void;
  // Pod-parent mode. Changing it (re-parent + edge swap) triggers a single
  // re-layout via the run token. Omitted → treated as 'node' (no extra layout).
  podParentMode?: PodParentMode;
  // Pinned tooltip for the left-click-selected node (derived from selectedNode by
  // KsgPanel). Forwarded to HoverTooltip → docks top-right + suppresses hover. Not
  // a useCytoscape dep, so it never re-inits the instance. null → floating hover.
  pinned?: PinnedTooltip | null;
  // True while the search query is non-empty (design D3). Switches the fade from focus to
  // miss: hits drive the lit set instead of the selection, and the selection ring itself is
  // untouched. Omitted/false → focus fade behaves exactly as before search existed.
  searchActive?: boolean;
  // Hit nodes with proxy-hit substitution already applied (KsgPanel's resolveSearchHits) —
  // fed to useGraphFade, which adds their incident edges + ancestors. Ignored when
  // searchActive is false/omitted.
  searchLitNodeIds?: ReadonlySet<string>;
  // The node the user LOCATED from the result list for the current query — NOT simply "the
  // selection while searching". Its 1-hop focus neighborhood joins the lit set, so locating
  // reads like a canvas left-click. A selection carried in from before the query (the
  // detail panel's × leaves selectedId set) must arrive here as null, or an unrelated
  // island lights up next to the hits. Ignored when searchActive is false/omitted, and
  // ignored for a zero-hit query (which fades the whole graph).
  searchFocusNodeId?: string | null;
  // Callback-ref for the imperative viewport API (design D5). Fired with the live
  // fitToIds/fitToNeighborhood handle once the cy instance is ready, and with null on
  // unmount. Search drives fit through this bridge without lifting the cy ref.
  onViewportApi?: (api: GraphViewportApi | null) => void;
}
