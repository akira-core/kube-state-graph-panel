# dev-environment delta — sync-netapp-storage-nodes

## ADDED Requirements

### Requirement: Demo seeder pushes the NetApp Harvest and kubelet storage series

`dev/victoriametrics/seed.sh` MUST push, on every tick, the series the backend's NetApp storage chain needs, so that `docker compose --profile backend up` makes `KSG Demo` actually produce `netapp-aggr` / `netapp-node` / `storage-cluster` nodes, `pvc-to-netapp-aggr` edges, and the three families of numbers (`health`, `usage`, and the edge I/O `metrics`). Without them the demo's storage half is empty and the panel's new rendering paths cannot be verified by eye.

The backend resolves storage through **three independently-degrading hops**, all rooted at the same join key — the PVC's `volumename` (its bound PV name) matched against the Harvest `volume_name` relabel. The fixture MUST seed all three; seeding one hop's metric names in place of another's silently costs whatever that hop owns.

**Hop A — `volume_labels` (topology; the SOLE source).** One series per volume, carrying `cluster` (the ONTAP cluster, **not** a Kubernetes one), `node` (the controller currently owning the aggregate), `aggr`, `svm`, and `volume_name` (**equal to** that PVC's `kube_persistentvolumeclaim_info.volumename` — this is the join key for the entire chain and the two spellings MUST match verbatim). This is an **info series**: the backend discards its sample value and reads only its labels. Everything topological — the `pvc-to-netapp-aggr` edge, the `netapp-aggr` and `netapp-node` entities, and the PVC's `svm` label — derives from this family and from nothing else, so omitting it costs the whole storage half of the graph even when every other family is present.

**Hop B — the six QoS workload families (the measurements).** `qos_read_ops` / `qos_write_ops` / `qos_read_latency` / `qos_write_latency` / `qos_read_data` / `qos_write_data`, each carrying the same `cluster` / `svm` / `volume_name` label set as hop A, plus `policy_group` (the QoS policy group the volume belongs to, which is hop C's join key). The backend reads these at **`{lun=""}`**: ONTAP collects a workload per LUN as well as per volume, and a LUN workload carries its FlexVol's relabelled `volume_name`, so the backend filters LUN workloads out to avoid double-counting the claim. The fixture's volume workloads MUST therefore carry either no `lun` label or an empty one — a non-empty `lun` makes the series invisible to the backend. A hop-B miss leaves a valid **measurement-less** edge: the topology survives, the edge simply carries no `metrics` key.

**Hop C — the two QoS fixed-policy families (the declared ceiling).** `qos_policy_fixed_max_throughput_iops` and `qos_policy_fixed_max_throughput_mbps`, joined on the `(cluster, svm, policy_group)` triple recovered from a matched hop-B series. The policy's identity label is read as `name` with a `policy_group` fallback (Harvest spells it differently across templates), so the fixture MAY use either. `..._mbps` is in **megabytes per second** and is the one value the backend converts (×`1048576`) so the wire's `max_bytes_per_sec` shares the unit of `read_bytes_per_sec`. A ceiling can never reach the wire without a hop-B measurement, so a policy series for a volume with no workload series is inert.

The remaining families are unchanged by the hop split:

- **Harvest aggregate, three families** — `aggr_new_status` (`1` = online) / `aggr_space_used` / `aggr_space_total`, carrying `cluster` / `node` / `aggr`, whose `(cluster, aggr)` MUST match an aggregate named by a hop-A series.
- **Harvest node family** — `node_new_status` (`1` = healthy), carrying `cluster` / `node`.
- **kubelet volume stats** — `kubelet_volume_stats_used_bytes` / `kubelet_volume_stats_capacity_bytes`, carrying `cluster` / `namespace` / `persistentvolumeclaim`, matching PVCs already in the fixture.

Every one of these series is a **gauge**: the backend reads the window's last sample with `last_over_time` and takes it verbatim (ops are already per-second, latency is already an average in microseconds, `qos_*_data` is already bytes per second). The seeder MUST NOT make them climb like counters — re-push a roughly steady value each tick (small jitter is fine). Monotonic growth would render absurd IOPS / latency / throughput in the demo. This is the **opposite** of the `traces_service_graph_*` counters in the same file, which MUST increase; the two rules MUST NOT be confused.

The fixture MUST cover both the **joined** and the **unjoined** PVC so the panel's degradation is visible on screen: at least one PVC whose `volumename` matches no `volume_labels` series (or whose series carries an empty `aggr`, the FlexGroup shape) MUST produce no `pvc-to-netapp-aggr` edge. `usage` MUST cover a high and a low band (roughly 70% and 20%) so the usage-fill difference is legible. The fixture MUST likewise cover both **ceiling states**: at least one joined volume in a QoS policy group with both `qos_policy_fixed_max_throughput_*` series, and at least one joined volume in no policy group at all, so the "measured but no declared ceiling" path renders in the demo rather than only in unit tests.

`docker-compose.yaml`'s default `KSG_BACKEND_TAG` MUST point at an image carrying the backend's `replace-storageclass-with-netapp-nodes` change; against an older tag the demo has no storage half whatsoever (the panel is a hard cut and no longer supports the old `storageclass` contract).

#### Scenario: Every tick pushes the complete NetApp series set

- **WHEN** the `ksg-seeder` container completes one tick
- **THEN** that push carries `volume_labels`, the six `qos_*` workload families, `qos_policy_fixed_max_throughput_iops` / `_mbps`, `aggr_new_status` / `aggr_space_used` / `aggr_space_total`, `node_new_status`, and the two `kubelet_volume_stats_*` families

#### Scenario: volume_name lines up with the PVC's volumename

- **WHEN** inspecting the `kube_persistentvolumeclaim_info` and `volume_labels` series the seeder pushes for one PVC (for example `prod/db/data-mongo-0`)
- **THEN** the former's `volumename` label and the latter's `volume_name` label are byte-identical, and the latter also carries `cluster` / `node` / `aggr` / `svm`

#### Scenario: Topology comes from volume_labels alone

- **WHEN** the fixture pushes the six `qos_*` workload families for a volume but no `volume_labels` series for it
- **THEN** the graph contains no `pvc-to-netapp-aggr` edge, no `netapp-aggr`, and no `netapp-node` for that volume — the measurements alone cannot draw the chain

#### Scenario: QoS workloads are seeded at volume granularity

- **WHEN** inspecting a `qos_read_ops` series in the fixture
- **THEN** it carries no `lun` label (or an empty one), so it survives the backend's `{lun=""}` selector and the claim is not double-counted against its LUN workload

#### Scenario: Ceiling joins on the policy triple

- **WHEN** a `qos_read_ops` series carries `cluster="ontap-prod"`, `svm="svm-prod"`, `policy_group="gold"`, and the fixture also pushes `qos_policy_fixed_max_throughput_iops` / `_mbps` for that same triple
- **THEN** the storage edge for that volume carries `max_iops` and `max_bytes_per_sec`, the latter already converted to bytes per second by the backend

#### Scenario: Demo covers a volume with no declared ceiling

- **WHEN** the fixture holds a second joined volume whose workload series belong to no policy group with `qos_policy_fixed_max_throughput_*` series
- **THEN** that volume's storage edge carries its measurements but neither ceiling field, and the panel renders no `max iops` / `max throughput` row for it

#### Scenario: Harvest series are gauges and do not climb per tick

- **WHEN** comparing the value of one `qos_read_ops` or `aggr_space_used` series across two consecutive ticks
- **THEN** the value MUST NOT climb monotonically like a counter but stays roughly steady (small jitter allowed) — the opposite of the `traces_service_graph_*` counters in the same file, which must increase

#### Scenario: Demo shows both a joined and an unjoined PVC

- **WHEN** `KSG Demo` starts with `--profile backend` and loads the graph
- **THEN** at least one PVC connects to a `netapp-aggr` (with I/O `metrics` on the edge) and at least one PVC has no `pvc-to-netapp-aggr` edge at all, so the panel's degradation is verifiable by eye

#### Scenario: usage covers a high and a low band

- **WHEN** inspecting the demo's `usage`-bearing nodes (PVCs and aggregates)
- **THEN** their utilisation spans at least one high (about 70%) and one low (about 20%) band, so the difference in usage-fill height is legible on screen
