# graph-search delta — unify-graph-fade

## MODIFIED Requirements

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
