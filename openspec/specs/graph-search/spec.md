# graph-search Specification

## Purpose

In-panel graph search: lets the user locate nodes in a dense multi-cluster topology instantly — **without re-querying the backend, without re-running layout, without changing the element set**. Miss fade shows where hits sit at a glance; the result list jumps (locates) to hits that are off-screen or folded inside collapsed containers. Complements Grafana template-variable filtering (re-query + full redraw); does not replace it.

## Requirements

### Requirement: Search bar rendering and lifecycle

The Panel SHALL render a **persistent** search bar at the **top-right** of the canvas (absolutely positioned, same inset band as the pinned hover-tooltip — **`right: 8`**, flush or near the panel top edge; layered above the canvas; it MUST NOT consume layout space or shrink the graph). The search bar MUST stack **above** the pinned hover attributes card when both are present: the two MUST NOT overlap; the pinned card docks **below** the search bar. The search query MUST be panel-local, ephemeral view state (`useState`, same family as `podParentMode` / `legendCollapsed`): it MUST NOT be written to panel options, MUST NOT trigger `onOptionsChange`, and is never persisted into dashboard JSON. On data refresh (new `PanelData`), the query and its effects MUST be preserved. The system MUST NOT register any global keyboard shortcut (e.g. `/`, `Ctrl+F`) to invoke search — keyboard behavior exists only while the input is focused (see "Keyboard interaction inside the search input"). When the search bar and the partial-parse warning banner are both present they MUST NOT overlap (banner remains top-left; search is top-right).

#### Scenario: Search bar always visible at top-right above pinned attributes

- **WHEN** the panel renders normally (not in error / first-load state)
- **THEN** the search input shows at the top-right of the canvas (right inset matching the pinned card); graph size and layout are unaffected by its presence
- **WHEN** a node is selected and the pinned attributes card is shown
- **THEN** the pinned card appears directly below the search bar without overlapping it

#### Scenario: Query is not persisted

- **WHEN** the user types a query and then reloads the dashboard page
- **THEN** the search input is empty with no fade or viewport effect; dashboard JSON contains no search-related field

#### Scenario: Data refresh preserves the query

- **WHEN** a dashboard refresh delivers new data while the query is non-empty
- **THEN** the query is preserved; the hit set is recomputed against the new elements and fade + list update accordingly

### Requirement: Hit matching rules

Whether a node is a **hit** SHALL be decided by a pure function: the query is split on whitespace into tokens; **every** token (AND) must match — case-insensitive substring — **any** (OR) of the node's six fields: `label`, `kind`, `namespace`, `cluster`, `application`, `ipAddress`. Missing fields are skipped. Matching MUST cover nodes only: an edge is never a hit and never appears in the result list; a hit node's incident edges stay lit alongside it (see "Miss fade"). No regex, fuzzy, or field-qualifier syntax. An empty (or whitespace-only) query means search is inactive.

#### Scenario: Single token substring-matches label

- **WHEN** the query is `mongo` and a node with label `mongodb-replica-0` exists
- **THEN** that node is a hit (case-insensitive — `Mongo` also matches)

#### Scenario: Multi-token AND across fields

- **WHEN** the query is `prod mongo`, node A (`cluster: prod`, `label: mongodb-0`), node B (`cluster: dr`, `label: mongodb-0`)
- **THEN** node A is a hit (the two tokens match cluster and label respectively); node B is not (`prod` matches nowhere)

#### Scenario: Reverse lookup by IP

- **WHEN** the query is `10.0.3` and a pod's `ipAddress` is `10.0.3.17`
- **THEN** that pod is a hit, and its result row's subline shows the matched field (`ipAddress: 10.0.3.17`)

#### Scenario: Edges are never hits

- **WHEN** the query is any edge-type string (e.g. `pod-calls-pod`)
- **THEN** no edge becomes a hit or appears in the result list; only nodes whose six fields happen to match (if any) are hits

### Requirement: Miss fade, mutually exclusive with focus fade

While the query is non-empty, the Panel SHALL fade all **non-hit** elements (**miss fade**) via style-class toggling only: it MUST NOT remove or hide elements, MUST NOT trigger a layout run, and MUST NOT participate in `computeVisibility`. The base lit (unfaded) set is: all hit nodes, their incident edges, their ancestor containers (a lit node must never sit inside a faded box), and proxy-hit containers (see "Proxy hit"). When the user has **located** a node for the current query (see "Locate"), the lit set MUST additionally include that node's focus neighborhood — closed neighborhood (incident edges + neighbour nodes), descendants, and the ancestors of those — so lighting matches a canvas left-click selection. That expansion applies **only to the locate focus**: a selection carried in from before the query (a canvas selection outlives the detail panel's close) MUST NOT expand the lit set, or an island unrelated to the query would read as a hit. A filter-hidden or otherwise invisible locate focus MUST NOT expand it either, and neither MUST a locate focus under a **zero-hit** query — "no results" always fades the whole graph. Miss fade and the selection-focus fade MUST be **mutually exclusive**: while the query is non-empty only miss fade applies (focus fade yields); when the query clears, all miss fade is removed and focus fade (if a selection exists) is restored.

#### Scenario: Typing fades non-hits immediately

- **WHEN** the user types a query that makes some nodes hits
- **THEN** non-hit elements fade; hits, their incident edges, and their ancestor containers stay lit; non-hit neighbours of hits remain faded; no element is hidden or moved and layout does not re-run

#### Scenario: Locating a result lights its 1-hop neighbours

- **WHEN** the query is non-empty and the user locates a visible result
- **THEN** miss fade remains the sole fade authority, and the lit set also includes that node's closed neighborhood (neighbour nodes stay lit, matching canvas-click focus lighting)

#### Scenario: A selection from before the search stays faded

- **WHEN** a node is selected, the user closes the detail panel (selection persists), and then types a query that does not match that node
- **THEN** the selected node and its neighbours fade with every other miss; only hits stay lit

#### Scenario: Editing the query drops the locate focus

- **WHEN** the user locates a result and then edits the query (types further, replaces it, or clears it)
- **THEN** the located node stops expanding the lit set; the fade follows the new query's hits alone

#### Scenario: Focus fade yields while searching

- **WHEN** a node is selected (selection-focus fade active) and the user types a non-empty query
- **THEN** the canvas shows miss fade only (driven by the hit set, plus the locate focus when one is set); the selection ring remains, but no focus fade is applied

#### Scenario: Clearing the query restores focus fade

- **WHEN** the query is cleared (or Esc-cleared) while a node is selected
- **THEN** all miss fade is removed and selection-focus fade is immediately restored (based on the selected node's neighborhood)

### Requirement: Viewport fit

After a typing pause (debounce), the Panel SHALL animate a fit to the **visible hit set** (including proxy-hit containers; **excluding** filter-hidden and otherwise invisible elements). The post-fit zoom MUST NOT exceed `1.5` (clamp to 1.5 and keep centered when exceeded). When the query clears, the viewport MUST stay where it is (no snapshot, no restore — clearing only removes the fade). When the hit set is empty the Panel MUST NOT fit (viewport unchanged).

#### Scenario: Debounced fit to all hits

- **WHEN** the user pauses typing and ≥1 visible hit exists
- **THEN** the viewport animates to fit the bounding box of all visible hits (including proxy-hit containers), zoom ≤ 1.5

#### Scenario: A single hit is not over-zoomed

- **WHEN** there is exactly one hit and a natural fit would push zoom far beyond 1.5
- **THEN** zoom clamps to 1.5 with the hit centered

#### Scenario: Viewport stays put on clear

- **WHEN** the user clears the query
- **THEN** the viewport keeps its last position (no restore animation); only the fade is removed

#### Scenario: Zero hits never move the viewport

- **WHEN** the query has no hits
- **THEN** the viewport does not move (whole graph faded; the result list shows a no-results message)

### Requirement: Result list

While the query is non-empty **and the result list is open**, a dropdown result list SHALL hang below the search bar; each row (**result**) corresponds to one hit: primary line `label` + kind badge; subline shows `namespace` / `cluster` context, and when the matched field is not `label` it MUST show that field and value (so the user understands why it matched). The list MUST be stably ordered by label, capped at **50** rows, with a trailing "N more" indicator beyond the cap. A hit inside a collapsed container MUST be annotated with its container (e.g. `in <controller> (collapsed)`). **Filter-hidden** hits (hidden by the kind / edge / ingress filter) MUST still be listed but rendered **disabled** with an `eye-slash` marker — announced, not locatable, and the list MUST NOT offer any path that silently mutates the filter. The list has a max height (≈40% of canvas height) and scrolls internally.

List open/closed is ephemeral UI state **independent of the query string**:

- The list MUST open when the user changes the query to a non-empty value, or when the search input receives focus while the query is already non-empty.
- The list MUST close when the search input loses focus (blur), when a non-disabled result is successfully activated (locate), or when the query becomes empty.
- Closing the list MUST NOT by itself clear the query, remove miss fade, or deselect a node.

#### Scenario: List shows hits with cap

- **WHEN** the query matches 120 nodes and the result list is open
- **THEN** the list shows the first 50 rows + "70 more"; each row carries label, kind badge, and a context subline

#### Scenario: Filter-hidden hit renders disabled with eye-slash

- **WHEN** a hit's kind is hidden via the legend eye and the result list is open
- **THEN** its row still appears, disabled + `eye-slash` icon; clicking has no effect (no selection, no fit, no `visibleKinds` change)

#### Scenario: Blur hides the result list without clearing the query

- **WHEN** the query is non-empty, the result list is open, and the search input loses focus
- **THEN** the result list hides; the query text, miss fade, and any existing selection remain unchanged

#### Scenario: Focus reopens the result list when the query is non-empty

- **WHEN** the query is non-empty, the result list is closed, and the user focuses the search input
- **THEN** the result list reopens with hits for the current query

### Requirement: Locate (activating a result row)

Activating (click or Enter) a non-disabled result SHALL act like a **canvas left-click on that node**, and SHALL, in order: (1) if the hit sits inside collapsed containers, expand its **collapsed ancestor chain** (that chain only, via the existing collapse-state update path — the only search action allowed to mutate collapse state); (2) select the node **and open the node-detail panel** when the node is detail-eligible (same path as canvas tap: highlight, pinned tooltip, variable export, **`detailOpen = true`** — non–detail-eligible nodes such as decorative `namespace` groups follow canvas rules and MUST NOT open the panel); (3) fit to the node's closed neighborhood (same zoom cap); (4) set the search input value to the result's **`label` only** (not namespace/cluster-qualified); (5) **close the result list**. After the query clears, containers expanded by locate MUST stay expanded (no auto-refold). Setting the input to the result label MAY recompute the hit set (substring match against that label); miss fade continues while the query remains non-empty even though the list is closed, and the located node becomes the **locate focus**, so the lit set includes its focus neighborhood (1-hop neighbours) per "Miss fade" until the query is edited.

#### Scenario: Locate a hit inside collapsed containers

- **WHEN** a hit sits inside a collapsed controller which itself sits inside a collapsed application, and the user clicks its result row
- **THEN** the application and controller expand in order (that chain only — other collapsed containers untouched), the node is selected, the detail panel opens if detail-eligible, and the viewport fits its closed neighborhood

#### Scenario: Locate commits the result label and closes the list

- **WHEN** the user activates a non-disabled result whose label is `mongodb-replica-0`
- **THEN** the search input value becomes `mongodb-replica-0`, the result list closes, and the node is selected (locate steps 1–3 still run)

#### Scenario: Locate opens the detail panel like a canvas node tap

- **WHEN** the user activates a non-disabled result for a detail-eligible node (e.g. a pod)
- **THEN** the node-detail panel opens (`detailOpen` true) with the same selection side-effects as a canvas left-click (highlight + top-right pinned tooltip + variable export)

#### Scenario: Locate of a non–detail-eligible node does not open the panel

- **WHEN** the user activates a result that is selectable but not detail-eligible (e.g. a decorative `namespace` group)
- **THEN** selection (and collapse cue behavior) may apply as on canvas, but the node-detail panel MUST NOT open

#### Scenario: Expansion survives query clear

- **WHEN** the user clears the query after locate expanded a container
- **THEN** the container stays expanded; only the fade is removed, viewport stays put

### Requirement: Proxy hit (visual stand-in for collapsed hits)

While typing (before any locate), a hit folded inside a collapsed container MUST be represented visually by its **outermost collapsed ancestor**: that container stays lit and counts toward the fit set. Typing MUST NOT auto-expand any container — expansion happens only via locate.

#### Scenario: Typing lights containers without expanding

- **WHEN** the query matches several pods inside collapsed controllers
- **THEN** each pod's outermost collapsed ancestor stays lit and joins the fit set; no container expands, layout untouched; the list still shows the pods (with collapsed annotations)

### Requirement: Keyboard interaction inside the search input

While the input is focused: `↑` / `↓` SHALL move the highlight cursor through the result list when it is open, **skipping disabled rows**, with scroll-follow; `Enter` SHALL locate the highlighted row when one exists (same steps as click: open detail when detail-eligible, commit-label, close-list), otherwise immediately fit all hits (without waiting for the debounce); `Esc` SHALL be two-stage — first press clears the query (fade removed, list closed, viewport stays put), second press (query already empty) blurs the input. These key events MUST NOT bubble to the Grafana host (avoiding its Esc / shortcut behavior).

#### Scenario: Arrow keys skip disabled rows

- **WHEN** the open list is [hit A, filter-hidden B, hit C], cursor on A, and the user presses `↓`
- **THEN** the cursor jumps to C (skipping B)

#### Scenario: Enter locates highlighted row and commits label

- **WHEN** a non-disabled row is highlighted and the user presses `Enter`
- **THEN** locate runs for that row, the input value becomes that result's `label`, and the result list closes

#### Scenario: Enter with no cursor fits immediately

- **WHEN** the user types quickly and presses `Enter` before the debounce fires, with no highlighted row
- **THEN** the viewport fits all hits immediately, without waiting for the debounce

#### Scenario: Two-stage Esc

- **WHEN** `Esc` is pressed while the query is non-empty
- **THEN** the query clears, the result list closes, and the fade is removed (viewport stays put); the input keeps focus
- **WHEN** `Esc` is pressed again with the query empty
- **THEN** the input blurs; the event does not bubble to Grafana

### Requirement: Canvas interaction clears search

When the user changes selection via the **graph canvas** (node tap, background tap, edge tap, or non-selectable cluster backplate — i.e. GraphCanvas `onSelect`, **not** SearchBar), and the search query is non-empty, the Panel SHALL clear the query with the same effects as Esc-clear: miss fade removed, result list closed, **viewport stays put**. The canvas selection / deselection from that click MUST still apply normally. **Locate** (activating a result from the search dropdown / Enter on a highlighted row) MUST NOT use this canvas-clear path: after locate the input still commits the result **label** and search effects follow that committed query (not forced empty). Detail-panel close and legend toggles MUST NOT clear search.

#### Scenario: Canvas node tap clears search

- **WHEN** the query is non-empty and the user taps a node on the canvas
- **THEN** the query clears, miss fade is removed, the result list closes, viewport stays put, and that node is selected (detail opens if detail-eligible)

#### Scenario: Canvas background tap clears search

- **WHEN** the query is non-empty and the user taps the graph background (or edge / cluster backplate)
- **THEN** the query clears, miss fade is removed, and selection is cleared per existing deselect rules

#### Scenario: Locate still commits label (does not force-empty search)

- **WHEN** the user activates a non-disabled result whose label is `mongodb-replica-0`
- **THEN** after locate the search input shows `mongodb-replica-0` (not empty); miss fade follows that committed query

### Requirement: Search never touches visibility or empty states

Search (fading) MUST NOT change `computeVisibility` output and MUST NOT trigger the empty-state overlay: under a zero-hit query every element stays on canvas (merely faded), and the "All elements filtered out" / "All node types filtered" empty states MUST NOT appear because of search.

#### Scenario: Zero hits do not trigger the empty state

- **WHEN** the query matches nothing (e.g. random characters)
- **THEN** the whole graph fades but every element remains visible; no empty-state overlay; the list shows a no-results message
