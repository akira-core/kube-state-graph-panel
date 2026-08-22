# panel-rendering delta — render-from-fixture-only

## ADDED Requirements

### Requirement: Promoted attribute rows for `role`, `ready`, `volumename`, and `svm`

`buildNodeAttributes` — the single source feeding both the floating hover tooltip and the
pinned selection card — SHALL emit these additional rows, each only when its source value is
a non-empty string, and never as an empty or placeholder row:

| Row key | Source | Emitted on |
| --- | --- | --- |
| `role` | `data.labels.role` | any node carrying the label, no kind restriction |
| `ready` | `data.readyStatus` | the K8s nodes the backend sends it on |
| `volumename` | `data.labels.volumename` | claims carrying the label |
| `svm` | `data.labels.svm` | claims carrying the label |

Row order SHALL be: `kind`, `role`, `namespace`, `application`, `ipAddress`, `storageclass`,
`volumename`, `svm`, `health`, `ready`, `usage`. `role` reads directly under `kind` because it
qualifies **what the node is**; the two storage label rows sit with `storageclass` and
`usage` because they are read together.

`role` SHALL be promoted for **any** value, not only the ingress pair. It is load-bearing for
the two ingress shapes — both are ordinary `type="service"` nodes and this label is the only
thing distinguishing them, while they behave differently under the ingress toggle — but an
unrecognised role must stay legible rather than be filtered to nothing.

`volumename` and `svm` are the keys the NetApp join hinges on: `volumename` is what Harvest's
relabel rule matches a FlexVol to, and `svm` scopes the QoS reads. When a claim fails to
reach an aggregate they are the first things an operator checks, so they belong beside the
storage rows rather than buried in the raw label list. A claim carrying `volumename` and
**no** `svm` is itself the signal that no Harvest label series matched it; the absent row
MUST NOT be filled in.

Every label key promoted to a row SHALL be suppressed from the raw label list below the
tooltip divider, driven by **one** exported list (`PROMOTED_LABEL_KEYS`) shared by the
promotion and the suppression — so adding a promotion cannot leave a duplicate row behind.

#### Scenario: Both ingress shapes read apart at a glance

- **WHEN** the user hovers a `service` node carrying `labels.role = "ingress-lb"`
- **THEN** the tooltip shows a `role: ingress-lb` row directly under `kind`, and no duplicate `role` row appears under the labels divider

#### Scenario: A K8s node's Ready condition is shown, and its absence is not

- **WHEN** the user hovers a K8s node carrying `readyStatus: "NotReady"`
- **THEN** the tooltip shows `ready: NotReady`
- **AND** hovering a K8s node with no `readyStatus` shows no `ready` row — not `ready: Unknown` and not an empty row

#### Scenario: A claim that resolved a PV but joined no aggregate

- **WHEN** the user hovers a `pvc` carrying `labels.volumename` and no `labels.svm`
- **THEN** the tooltip shows the `volumename` row and no `svm` row
