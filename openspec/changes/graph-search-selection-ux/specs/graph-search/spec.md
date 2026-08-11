# graph-search

## Purpose

In-panel graph search: lets the user locate nodes in a dense multi-cluster topology instantly — **without re-querying the backend, without re-running layout, without changing the element set**. Miss fade shows where hits sit at a glance; the result list jumps (locates) to hits that are off-screen or folded inside collapsed containers. Complements Grafana template-variable filtering (re-query + full redraw); does not replace it.

## ADDED Requirements

### Requirement: Search bar rendering and lifecycle

The Panel SHALL render a **persistent** floating search bar **top-center** over the canvas (absolutely positioned, layered above the canvas; it MUST NOT consume layout space or shrink the graph). The search query MUST be panel-local, ephemeral view state (`useState`, same family as `podParentMode` / `legendCollapsed`): it MUST NOT be written to panel options, MUST NOT trigger `onOptionsChange`, and is never persisted into dashboard JSON. On data refresh (new `PanelData`), the query and its effects MUST be preserved. The system MUST NOT register any global keyboard shortcut (e.g. `/`, `Ctrl+F`) to invoke search — keyboard behavior exists only while the input is focused (see "Keyboard interaction inside the search input"). When the search bar and the partial-parse warning banner are both present they MUST NOT overlap.

#### Scenario: Search bar always visible

- **WHEN** the panel renders normally (not in error / first-load state)
- **THEN** the search input shows top-center over the canvas; graph size and layout are unaffected by its presence

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

While the query is non-empty, the Panel SHALL fade all **non-hit** elements (**miss fade**) via style-class toggling only: it MUST NOT remove or hide elements, MUST NOT trigger a layout run, and MUST NOT participate in `computeVisibility`. The lit (unfaded) set is: all hit nodes, their incident edges, their ancestor containers (a lit node must never sit inside a faded box), and proxy-hit containers (see "Proxy hit"). Miss fade and the selection-focus fade MUST be **mutually exclusive**: while the query is non-empty only miss fade applies (focus fade yields); when the query clears, all miss fade is removed and focus fade (if a selection exists) is restored.

#### Scenario: Typing fades non-hits immediately

- **WHEN** the user types a query that makes some nodes hits
- **THEN** non-hit elements fade; hits, their incident edges, and their ancestor containers stay lit; no element is hidden or moved and layout does not re-run

#### Scenario: Focus fade yields while searching

- **WHEN** a node is selected (selection-focus fade active) and the user types a non-empty query
- **THEN** the canvas shows miss fade only (driven by the hit set); the selection ring remains, but the focus fade's neighborhood dimming is not applied

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

While the query is non-empty, a dropdown result list SHALL hang below the search bar; each row (**result**) corresponds to one hit: primary line `label` + kind badge; subline shows `namespace` / `cluster` context, and when the matched field is not `label` it MUST show that field and value (so the user understands why it matched). The list MUST be stably ordered by label, capped at **50** rows, with a trailing "N more" indicator beyond the cap. A hit inside a collapsed container MUST be annotated with its container (e.g. `in <controller> (collapsed)`). **Filter-hidden** hits (hidden by the kind / edge / ingress filter) MUST still be listed but rendered **disabled** with an `eye-slash` marker — announced, not locatable, and the list MUST NOT offer any path that silently mutates the filter. The list has a max height (≈40% of canvas height) and scrolls internally.

#### Scenario: List shows hits with cap

- **WHEN** the query matches 120 nodes
- **THEN** the list shows the first 50 rows + "70 more"; each row carries label, kind badge, and a context subline

#### Scenario: Filter-hidden hit renders disabled with eye-slash

- **WHEN** a hit's kind is hidden via the legend eye
- **THEN** its row still appears, disabled + `eye-slash` icon; clicking has no effect (no selection, no fit, no `visibleKinds` change)

### Requirement: Locate (activating a result row)

Activating (click or Enter) a non-disabled result SHALL, in order: (1) if the hit sits inside collapsed containers, expand its **collapsed ancestor chain** (that chain only, via the existing collapse-state update path — the only search action allowed to mutate collapse state); (2) select the node (a full selection: highlight, pinned tooltip, variable export all take effect); (3) fit to the node's closed neighborhood (same zoom cap). Locate MUST NOT open the node-detail panel (the panel opens only via an on-canvas node tap — see panel-rendering). After the query clears, containers expanded by locate MUST stay expanded (no auto-refold).

#### Scenario: Locate a hit inside collapsed containers

- **WHEN** a hit sits inside a collapsed controller which itself sits inside a collapsed application, and the user clicks its result row
- **THEN** the application and controller expand in order (that chain only — other collapsed containers untouched), the node is selected, and the viewport fits its closed neighborhood

#### Scenario: Locate does not open the detail panel

- **WHEN** the user locates any result
- **THEN** the node is selected (highlight + top-right pinned tooltip + variable export) but the node-detail panel does not open

#### Scenario: Expansion survives query clear

- **WHEN** the user clears the query after locate expanded a container
- **THEN** the container stays expanded; only the fade is removed, viewport stays put

### Requirement: Proxy hit (visual stand-in for collapsed hits)

While typing (before any locate), a hit folded inside a collapsed container MUST be represented visually by its **outermost collapsed ancestor**: that container stays lit and counts toward the fit set. Typing MUST NOT auto-expand any container — expansion happens only via locate.

#### Scenario: Typing lights containers without expanding

- **WHEN** the query matches several pods inside collapsed controllers
- **THEN** each pod's outermost collapsed ancestor stays lit and joins the fit set; no container expands, layout untouched; the list still shows the pods (with collapsed annotations)

### Requirement: Keyboard interaction inside the search input

While the input is focused: `↑` / `↓` SHALL move the highlight cursor through the result list, **skipping disabled rows**, with scroll-follow; `Enter` SHALL locate the highlighted row when one exists, otherwise immediately fit all hits (without waiting for the debounce); `Esc` SHALL be two-stage — first press clears the query (fade removed, viewport stays put), second press (query already empty) blurs the input. These key events MUST NOT bubble to the Grafana host (avoiding its Esc / shortcut behavior).

#### Scenario: Arrow keys skip disabled rows

- **WHEN** the list is [hit A, filter-hidden B, hit C], cursor on A, and the user presses `↓`
- **THEN** the cursor jumps to C (skipping B)

#### Scenario: Enter with no cursor fits immediately

- **WHEN** the user types quickly and presses `Enter` before the debounce fires, with no highlighted row
- **THEN** the viewport fits all hits immediately, without waiting for the debounce

#### Scenario: Two-stage Esc

- **WHEN** `Esc` is pressed while the query is non-empty
- **THEN** the query clears and the fade is removed (viewport stays put); the input keeps focus
- **WHEN** `Esc` is pressed again with the query empty
- **THEN** the input blurs; the event does not bubble to Grafana

### Requirement: Search never touches visibility or empty states

Search (fading) MUST NOT change `computeVisibility` output and MUST NOT trigger the empty-state overlay: under a zero-hit query every element stays on canvas (merely faded), and the "All elements filtered out" / "All node types filtered" empty states MUST NOT appear because of search.

#### Scenario: Zero hits do not trigger the empty state

- **WHEN** the query matches nothing (e.g. random characters)
- **THEN** the whole graph fades but every element remains visible; no empty-state overlay; the list shows a no-results message
