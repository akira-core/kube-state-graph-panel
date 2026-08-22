# graph-data-integration delta — render-from-fixture-only

## ADDED Requirements

### Requirement: K8s node `ready_status` normalization

`normalizeGraph` SHALL carry an upstream node's `ready_status` onto the produced cytoscape
node as `data.readyStatus`, a `string`, when it is a non-empty string; otherwise the field
SHALL be **absent** from `data` entirely.

The value SHALL be passed through **verbatim**, with no mapping, casing change, or
membership check against the backend's `"Ready"` / `"NotReady"` / `"Unknown"` triple. The
guard is the same one `health` uses, for the same reason: an upstream that grows a fourth
condition value must surface it rather than vanish.

**Absence MUST NOT be defaulted to `"Unknown"`, `""`, or any other value.** The backend omits
the field when the node carries no Ready-condition series at all and reserves the literal
`"Unknown"` for the genuine Kubernetes state where the kubelet has stopped reporting.
Conflating the two would render a scrape gap as a cluster-wide outage.

`readyStatus` is a **third status axis** and MUST NOT feed `data.status`, `data.worstStatus`,
the status border colour, or any alert aggregation. Kubernetes' Ready condition and the
panel's alert severity answer different questions, and a node can legitimately be `NotReady`
with nothing firing; folding one into the other would make one colour mean two things.

#### Scenario: Each condition value passes through unchanged

- **WHEN** an upstream `node` carries `ready_status: "NotReady"`
- **THEN** the produced node's `data.readyStatus` is `'NotReady'`

#### Scenario: A node with no Ready data carries no field

- **WHEN** an upstream `node` carries no `ready_status` key, or an empty string, or a non-string value
- **THEN** the produced `data` has no `readyStatus` key — never `''`, never `'Unknown'` — and nothing is added to `errors`

#### Scenario: An unrecognised condition value survives

- **WHEN** an upstream `node` carries `ready_status: "SchedulingDisabled"`
- **THEN** `data.readyStatus` is `'SchedulingDisabled'`

#### Scenario: The status axes are untouched

- **WHEN** a node carrying `ready_status: "NotReady"` and no alerts is normalized
- **THEN** its produced `data` is identical to the same node normalized without `ready_status`, apart from the `readyStatus` field itself

## MODIFIED Requirements

### Requirement: Datasource integration strategy

The panel SHALL consume its graph through the Grafana Infinity datasource
(`yesoreyeram-infinity-datasource`) and SHALL NOT issue HTTP requests of its own. All data
reaches the panel as Grafana `DataFrame`s through the standard query mechanism.

Infinity's `inline` source and its `url` source are **indistinguishable to the panel**:
`useGraphData` receives a `PanelData` either way and `normalizeGraph` validates the same
payload shape. This repository provisions only an `inline` target — see the dev-environment
capability — but nothing in `src/**` knows or may assume that. A deployment binding the same
panel to a `url` target pointed at a real kube-state-graph server MUST work unchanged.

#### Scenario: The panel reads from the datasource, whatever its source

- **WHEN** the panel executes a query through the Grafana query mechanism
- **THEN** Infinity supplies the response as a `DataFrame`, and the panel's parsing path is the same for an `inline` target and a `url` target

#### Scenario: No direct network access from panel source

- **WHEN** scanning the source
- **THEN** `src/**` contains no `fetch`, `axios`, or `XMLHttpRequest` call to any backend; every data access goes through the Grafana runtime API

### Requirement: Datasource provisioning

`provisioning/datasources/` SHALL provision one Infinity datasource with the uid the
provisioned dashboard references, created automatically when Grafana starts under
`docker compose`.

The datasource SHALL carry **no `url`**. The only provisioned target is `source: "inline"`,
which parses a JSON string embedded in the dashboard and never issues a request — but an
inline target is still routed through a datasource, so the instance must exist for the uid to
resolve. A `url` here would address a service this repository does not contain.

#### Scenario: Datasource ready, addressing nothing

- **WHEN** running `docker compose up -d` and waiting for Grafana to start
- **THEN** the Datasources list contains the `kube-state-graph` Infinity datasource with uid `ksg-default`, and its configuration carries no URL

### Requirement: Example dashboard provisioning

`provisioning/dashboards/` SHALL provide exactly **one** demo dashboard, `KSG Showcase`
(`/d/ksg-switch-demo`), containing one instance of this plugin's panel fed by a single
Infinity `inline` target.

Opening it SHALL render a populated graph with no other container running. The EmptyState
path is therefore **not** reachable from the provisioned demo, and is covered by unit tests
instead — the previous second dashboard, which showed a datasource error whenever the backend
stack was not started, is removed.

#### Scenario: The demo dashboard renders a populated graph on its own

- **WHEN** Grafana finishes starting from a plain `docker compose up -d`
- **THEN** the Dashboards list contains `KSG Showcase`, and opening it renders graph elements rather than an EmptyState or a datasource error
