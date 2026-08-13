## REMOVED Requirements

### Requirement: Miss fade, mutually exclusive with focus fade

**Reason**: Two coupled revisions. (1) The lit set no longer admits a **locate focus**: locate now clears the query, so there is no state in which a query is active *and* a node has been located for it — the expansion this requirement described is unreachable, and its scenarios ("Locating a result lights its 1-hop neighbours", "Editing the query drops the locate focus") describe a concept being deleted from the domain vocabulary. (2) The per-hit lit set changes from "hit + incident edges + ancestors" to the hit's full **focus neighborhood** (adding 1-hop neighbour nodes + descendants): the old shape lit an edge while fading the node at its far end, leaving lit edges dangling into faded nodes.
**Migration**: Replaced by "Miss fade over the hit set alone". Carried over: class-toggle only, no hide / no layout / no `computeVisibility`, proxy-hit containers, zero-hit fades the whole graph, mutual exclusivity with focus fade, and a pre-search selection never widening the lit set. Changed: each hit now lights the same focus neighborhood a canvas click would.

### Requirement: Locate (activating a result row)

**Reason**: Step 4 inverts — locate clears the search input instead of committing the result's `label`, which ends the search state instead of continuing it under a new query. The scenarios "Locate commits the result label and closes the list" and "Expansion survives query clear" are named for the committed-label lifecycle.
**Migration**: Replaced by "Locate (activating a result row) ends the search". Steps 1–3 and 5 are unchanged (expand collapsed ancestor chain → select + open detail when eligible → fit to closed neighborhood → close the list), as is the no-auto-refold rule.

### Requirement: Keyboard interaction inside the search input

**Reason**: `Enter`-locate followed the same commit-label path; its scenario "Enter locates highlighted row and commits label" asserts the input value becomes the result label.
**Migration**: Replaced by "Keyboard interaction inside the search input (arrows, Enter, Esc)". Arrow-key navigation, Enter-with-no-cursor fit-all, two-stage Esc, and the no-bubbling rule are unchanged.

### Requirement: Canvas interaction clears search

**Reason**: The requirement carved locate *out* of the clear path ("Locate ... MUST NOT use this canvas-clear path"), which is exactly the behavior being reversed. Its scenario "Locate still commits label (does not force-empty search)" asserts the opposite of the new rule.
**Migration**: Replaced by "Canvas interaction and locate clear search". Canvas node / background / edge / backplate taps behave identically; detail-panel close and legend toggles still MUST NOT clear search.

## ADDED Requirements

### Requirement: Miss fade over the hit set alone

While the query is non-empty, the Panel SHALL fade all **non-hit** elements (**miss fade**) via style-class toggling only: it MUST NOT remove or hide elements, MUST NOT trigger a layout run, and MUST NOT participate in `computeVisibility`. The lit (unfaded) set is exactly the union of each hit's **focus neighborhood** — the same set a canvas left-click on that node would light: the hit itself, its incident edges, its 1-hop neighbour nodes, its descendants, and the ancestor containers of all of those (a lit node must never sit inside a faded box) — with proxy-hit containers (see "Proxy hit") lighting theirs the same way. Because every lit edge's far endpoint is a lit neighbour, a lit edge MUST NOT end in a faded node. **No selection expands that set** — not one carried in from before the query (a canvas selection outlives the detail panel's close), and not the node the user most recently located, because locate leaves the query empty and therefore ends miss fade outright rather than widening it. A **zero-hit** query yields an empty lit set and fades the whole graph. Miss fade and the selection-focus fade MUST be **mutually exclusive**: while the query is non-empty only miss fade applies (focus fade yields); when the query becomes empty — by editing, by Esc, by a canvas click, or by locate — all miss fade is removed and focus fade (if a selection exists) is restored.

#### Scenario: Typing fades non-hits immediately

- **WHEN** the user types a query that makes some nodes hits
- **THEN** non-hit elements fade; each hit, its incident edges, its 1-hop neighbour nodes, and their ancestor containers stay lit — exactly what clicking that hit would light; elements outside every hit's focus neighborhood remain faded; no element is hidden or moved and layout does not re-run

#### Scenario: No lit edge ends in a faded node

- **WHEN** a query hits a node whose neighbour would not itself match the query
- **THEN** that neighbour node stays lit alongside the connecting edge — the canvas never shows a lit edge terminating in a faded node

#### Scenario: A selection from before the search stays faded

- **WHEN** a node is selected, the user closes the detail panel (selection persists), and then types a query that does not match that node and does not hit any of its neighbours
- **THEN** the selected node and its neighbourhood fade with every other miss; only the hits' focus neighborhoods stay lit

#### Scenario: Zero hits fade the whole graph

- **WHEN** the query is non-empty and matches no node, with or without a live selection
- **THEN** every element is faded; no element is hidden and the empty-state overlay does not appear

#### Scenario: Focus fade yields while searching

- **WHEN** a node is selected (selection-focus fade active) and the user types a non-empty query
- **THEN** the canvas shows miss fade only, driven by the hit set alone; the selection ring remains, but no focus fade is applied

#### Scenario: Clearing the query restores focus fade

- **WHEN** the query is cleared (or Esc-cleared) while a node is selected
- **THEN** all miss fade is removed and selection-focus fade is immediately restored (based on the selected node's neighborhood)

### Requirement: Locate (activating a result row) ends the search

Activating (click or Enter) a non-disabled result SHALL act like a **canvas left-click on that node plus a viewport fit**, and SHALL, in order: (1) if the hit sits inside collapsed containers, expand its **collapsed ancestor chain** (that chain only, via the existing collapse-state update path — the only search action allowed to mutate collapse state); (2) select the node **and open the node-detail panel** when the node is detail-eligible (same path as canvas tap: highlight, pinned tooltip, variable export, **`detailOpen = true`** — non–detail-eligible nodes such as decorative `namespace` groups follow canvas rules and MUST NOT open the panel); (3) fit to the node's closed neighborhood (same zoom cap); (4) **clear the search query** — the input is left empty and MUST NOT hold the result label or any other text; (5) **close the result list**.

Clearing the query in step 4 MUST NOT cancel the fit from step 3, MUST NOT move the viewport on its own, and MUST NOT fire the debounced fit-to-all-hits. Because the query is empty afterwards, miss fade is removed and the fade authority reverts to **focus fade** on the node just selected, so exactly that node's neighborhood stays lit. Containers expanded by locate MUST stay expanded afterwards (no auto-refold).

#### Scenario: Locate a hit inside collapsed containers

- **WHEN** a hit sits inside a collapsed controller which itself sits inside a collapsed application, and the user clicks its result row
- **THEN** the application and controller expand in order (that chain only — other collapsed containers untouched), the node is selected, the detail panel opens if detail-eligible, and the viewport fits its closed neighborhood

#### Scenario: Locate clears the query and closes the list

- **WHEN** the user activates a non-disabled result whose label is `mongodb-replica-0`
- **THEN** the search input becomes empty, the result list closes, and the node is selected (locate steps 1–3 still run)

#### Scenario: Locate lights only the located node's neighborhood

- **WHEN** the query `gateway` matches several nodes (e.g. a `gateway` pod plus a whole `mesh-gateway` application, controller and pod) and the user locates the `gateway` pod
- **THEN** only the `gateway` pod's focus neighborhood stays lit — the other former hits, their incident edges, and every edge whose far endpoint is faded are faded too

#### Scenario: Locate opens the detail panel like a canvas node tap

- **WHEN** the user activates a non-disabled result for a detail-eligible node (e.g. a pod)
- **THEN** the node-detail panel opens (`detailOpen` true) with the same selection side-effects as a canvas left-click (highlight + top-right pinned tooltip + variable export)

#### Scenario: Locate of a non–detail-eligible node does not open the panel

- **WHEN** the user activates a result that is selectable but not detail-eligible (e.g. a decorative `namespace` group)
- **THEN** selection (and collapse cue behavior) may apply as on canvas, but the node-detail panel MUST NOT open

#### Scenario: Expansion survives locate

- **WHEN** locate expanded a container in order to reach its hit
- **THEN** the container stays expanded after the query clears; only the fade changes, and the viewport keeps the fit locate performed

### Requirement: Keyboard interaction inside the search input (arrows, Enter, Esc)

While the input is focused: `↑` / `↓` SHALL move the highlight cursor through the result list when it is open, **skipping disabled rows**, with scroll-follow; `Enter` SHALL locate the highlighted row when one exists (same steps as click: open detail when detail-eligible, fit, clear the query, close the list), otherwise immediately fit all hits (without waiting for the debounce); `Esc` SHALL be two-stage — first press clears the query (fade removed, list closed, viewport stays put), second press (query already empty) blurs the input. These key events MUST NOT bubble to the Grafana host (avoiding its Esc / shortcut behavior).

#### Scenario: Arrow keys skip disabled rows

- **WHEN** the open list is [hit A, filter-hidden B, hit C], cursor on A, and the user presses `↓`
- **THEN** the cursor jumps to C (skipping B)

#### Scenario: Enter locates highlighted row and clears the query

- **WHEN** a non-disabled row is highlighted and the user presses `Enter`
- **THEN** locate runs for that row, the input value becomes empty, and the result list closes

#### Scenario: Enter with no cursor fits immediately

- **WHEN** the user types quickly and presses `Enter` before the debounce fires, with no highlighted row
- **THEN** the viewport fits all hits immediately, without waiting for the debounce

#### Scenario: Two-stage Esc

- **WHEN** `Esc` is pressed while the query is non-empty
- **THEN** the query clears, the result list closes, and the fade is removed (viewport stays put); the input keeps focus
- **WHEN** `Esc` is pressed again with the query empty
- **THEN** the input blurs; the event does not bubble to Grafana

### Requirement: Canvas interaction and locate clear search

When the user changes selection via the **graph canvas** (node tap, background tap, edge tap, or non-selectable cluster backplate — i.e. GraphCanvas `onSelect`) and the search query is non-empty, the Panel SHALL clear the query with the same effects as Esc-clear: miss fade removed, result list closed, **viewport stays put**. The canvas selection / deselection from that click MUST still apply normally. **Locate** SHALL clear the query as well (see "Locate (activating a result row) ends the search"); it differs from a canvas tap only in that it first expands the collapsed ancestor chain and then fits the viewport to the located node's closed neighborhood. Detail-panel close and legend toggles MUST NOT clear search.

#### Scenario: Canvas node tap clears search

- **WHEN** the query is non-empty and the user taps a node on the canvas
- **THEN** the query clears, miss fade is removed, the result list closes, viewport stays put, and that node is selected (detail opens if detail-eligible)

#### Scenario: Canvas background tap clears search

- **WHEN** the query is non-empty and the user taps the graph background (or edge / cluster backplate)
- **THEN** the query clears, miss fade is removed, and selection is cleared per existing deselect rules

#### Scenario: Locate clears search but still fits

- **WHEN** the user activates a non-disabled result whose label is `mongodb-replica-0`
- **THEN** the query clears exactly as on a canvas tap, and unlike a canvas tap the viewport fits that node's closed neighborhood
