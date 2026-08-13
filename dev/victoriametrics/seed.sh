#!/bin/sh
# kube-state-graph demo metrics seeder.
#
# Pushes the synthetic topology fixture plus an ever-increasing set of
# traces_service_graph_request_* counters into VictoriaMetrics on a loop.
# The backend derives the whole graph from PromQL over a [start,end] window, so
# two things must hold continuously:
#
#   * topology gauges (topology.prom) must have a fresh sample in the window
#     -> last_over_time(...[window]) returns them. We re-push every tick.
#   * service-graph counters must INCREASE across >=2 samples in the window
#     -> rate(...[window]) > 0, otherwise pod-calls-pod / service-selects-pod
#        edges never appear, and the RED companions below yield no measurement.
#     We bump every counter each tick.
#
# THREE metric families per edge, and their label sets must match EXACTLY:
#
#   traces_service_graph_request_total                -> edge existence + `rate`
#   traces_service_graph_request_failed_total         -> `error_rate`
#   traces_service_graph_request_server_seconds_bucket-> `p90_server_ms`
#
# The backend joins them by exact series identity (every label except __name__;
# the histogram additionally except `le`). A single extra, missing or misspelled
# label makes the join return nothing and the RED fields silently disappear with
# no error anywhere. That is why emit_edge() takes the label set ONCE and writes
# all three families from it — divergence is structurally impossible, not merely
# unlikely.
#
# Two more producer rules the backend enforces:
#   * no series may carry edge_relation="link" (the RED queries exclude it, so a
#     link-only edge is emitted but never measured). We never set that label.
#   * the histogram must be CLASSIC and cumulative: >= 2 `le` boundaries, ending
#     in le="+Inf", values non-decreasing along `le`. Native histograms and
#     VictoriaMetrics `vmrange` buckets have no parseable `le`, so the backend
#     drops p90_server_ms for them.
#
# Not every edge ends up with RED, by design: the backend measures an edge only
# when BOTH resolved endpoints are pod or service nodes, so the consumer ->
# api.payments.io edge stays unmeasured even though it is seeded identically
# here. That gives the demo both cases — the panel's "no RED rows" state is
# driven by backend eligibility, not by missing source data.
#
# VictoriaMetrics /api/v1/import/prometheus stamps each sample at ingestion
# time when no explicit timestamp is given, so a steady loop is all we need.
set -eu

VM="${VM_URL:-http://victoriametrics:8428}"
INTERVAL="${SEED_INTERVAL:-10}"
TOPOLOGY="${TOPOLOGY_FILE:-/seed/topology.prom}"

# Requests added per edge per tick. Large enough that the per-tick failure counts
# below stay whole numbers and land error_rate strictly inside (0,1).
REQ_PER_TICK=100

# Classic-histogram bucket boundaries, in seconds, ascending and ending in +Inf.
# emit_edge() consumes one cumulative count per boundary, in this order.
LE_BOUNDS='0.01 0.05 0.1 0.5 +Inf'

# emit_edge <labels> <failed-per-tick> <cumulative bucket counts...>
#
# Writes all three metric families for one edge from a single label set. Bucket
# counts are per tick and cumulative (each >= the previous); the final one is
# le="+Inf" and matches REQ_PER_TICK so the histogram accounts for every request.
emit_edge() {
  _labels="$1"
  _failed="$2"
  shift 2
  printf 'traces_service_graph_request_total{%s} %s\n' "${_labels}" "$((i * REQ_PER_TICK))"
  printf 'traces_service_graph_request_failed_total{%s} %s\n' "${_labels}" "$((i * _failed))"
  for _le in ${LE_BOUNDS}; do
    printf 'traces_service_graph_request_server_seconds_bucket{%s,le="%s"} %s\n' "${_labels}" "${_le}" "$((i * $1))"
    shift
  done
}

# Label sets, one per demo edge. Empty server_k8s_pod_uid triggers connection-string
# ("://") resolution; a populated UID resolves via the topology pod-UID index
# (recovers the server cluster, enabling cross-cluster edges).
#
#   1 gateway  -> mongo-svc.prod (2-label DNS)  pod-calls-service + service-selects-pod -> mongo-0/1/2
#   2 consumer -> nats-svc.dr   (2-label DNS)   pod-calls-service + service-selects-pod -> nats-0/1/2
#   3 gateway  -> dr/consumer   (server UID)    cross-cluster pod-calls-pod (prod -> dr)
#   4 consumer -> api.payments.io (no UID)      external node + pod-calls-pod (never measured)
GATEWAY_TO_MONGO='cluster="prod",client="prod/gateway",server="mongodb://mongo-svc.prod.svc.cluster.local:27017",client_k8s_pod_uid="u-gateway",server_k8s_pod_uid="",client_k8s_namespace_name="prod",server_k8s_namespace_name=""'
CONSUMER_TO_NATS='cluster="dr",client="dr/consumer",server="nats://nats-svc.dr.svc.cluster.local:4222",client_k8s_pod_uid="u-consumer",server_k8s_pod_uid="",client_k8s_namespace_name="dr",server_k8s_namespace_name=""'
GATEWAY_TO_CONSUMER='cluster="prod",client="prod/gateway",server="dr/consumer",client_k8s_pod_uid="u-gateway",server_k8s_pod_uid="u-consumer",client_k8s_namespace_name="prod",server_k8s_namespace_name="dr"'
CONSUMER_TO_PAYMENTS='cluster="dr",client="dr/consumer",server="api.payments.io",client_k8s_pod_uid="u-consumer",server_k8s_pod_uid="",client_k8s_namespace_name="dr",server_k8s_namespace_name=""'

echo "ksg-seeder: target=${VM} interval=${INTERVAL}s topology=${TOPOLOGY}"

i=0
while true; do
  i=$((i + 1))

  # Static topology + dynamic service-graph counters (monotonic in ${i}). The failure
  # and bucket shapes differ per edge so the demo shows a spread of RED values rather
  # than the same numbers four times.
  {
    cat "${TOPOLOGY}"
    emit_edge "${GATEWAY_TO_MONGO}" 7 50 80 90 100 100      # 7% errors,  p90 ~100ms
    emit_edge "${CONSUMER_TO_NATS}" 2 80 95 99 100 100      # 2% errors,  p90 ~37ms
    emit_edge "${GATEWAY_TO_CONSUMER}" 15 20 50 70 95 100   # 15% errors, p90 ~420ms
    emit_edge "${CONSUMER_TO_PAYMENTS}" 3 60 85 95 100 100  # external target -> unmeasured
  } | curl -fsS --data-binary @- "${VM}/api/v1/import/prometheus" \
    && echo "ksg-seeder: tick ${i} pushed" \
    || echo "ksg-seeder: tick ${i} failed (VM not ready yet?)"

  sleep "${INTERVAL}"
done
