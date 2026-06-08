#!/bin/sh
# kube-state-graph v0.0.14 demo metrics seeder.
#
# Pushes the synthetic topology fixture plus an ever-increasing set of
# traces_service_graph_request_total counters into VictoriaMetrics on a loop.
# The backend derives the whole graph from PromQL over a [start,end] window, so
# two things must hold continuously:
#
#   * topology gauges (topology.prom) must have a fresh sample in the window
#     -> last_over_time(...[window]) returns them. We re-push every tick.
#   * service-graph counters must INCREASE across >=2 samples in the window
#     -> rate(...[window]) > 0, otherwise pod-calls-pod / service-selects-pod
#        edges never appear. We bump the value each tick.
#
# VictoriaMetrics /api/v1/import/prometheus stamps each sample at ingestion
# time when no explicit timestamp is given, so a steady loop is all we need.
set -eu

VM="${VM_URL:-http://victoriametrics:8428}"
INTERVAL="${SEED_INTERVAL:-10}"
TOPOLOGY="${TOPOLOGY_FILE:-/seed/topology.prom}"

echo "ksg-seeder: target=${VM} interval=${INTERVAL}s topology=${TOPOLOGY}"

i=0
while true; do
  i=$((i + 1))

  # Static topology + dynamic service-graph counters (value = ${i}, monotonic).
  # Each labelled series lands a specific edge. Empty server_k8s_pod_uid triggers
  # connection-string ("://") resolution; a populated UID resolves via the topology
  # pod-UID index (recovers the server cluster, enabling cross-cluster edges).
  #
  #   1 gateway  -> mongo-svc.prod (2-label DNS)  pod-calls-service + service-selects-pod -> mongo-0/1/2
  #   2 consumer -> nats-svc.dr   (2-label DNS)   pod-calls-service + service-selects-pod -> nats-0/1/2
  #   3 gateway  -> dr/consumer   (server UID)    cross-cluster pod-calls-pod (prod -> dr)
  #   4 consumer -> api.payments.io (no UID)      external node + pod-calls-pod
  {
    cat "${TOPOLOGY}"
    cat <<EOF
traces_service_graph_request_total{cluster="prod",client="prod/gateway",server="mongodb://mongo-svc.prod.svc.cluster.local:27017",client_k8s_pod_uid="u-gateway",server_k8s_pod_uid="",client_k8s_namespace_name="prod",server_k8s_namespace_name=""} ${i}
traces_service_graph_request_total{cluster="dr",client="dr/consumer",server="nats://nats-svc.dr.svc.cluster.local:4222",client_k8s_pod_uid="u-consumer",server_k8s_pod_uid="",client_k8s_namespace_name="dr",server_k8s_namespace_name=""} ${i}
traces_service_graph_request_total{cluster="prod",client="prod/gateway",server="dr/consumer",client_k8s_pod_uid="u-gateway",server_k8s_pod_uid="u-consumer",client_k8s_namespace_name="prod",server_k8s_namespace_name="dr"} ${i}
traces_service_graph_request_total{cluster="dr",client="dr/consumer",server="api.payments.io",client_k8s_pod_uid="u-consumer",server_k8s_pod_uid="",client_k8s_namespace_name="dr",server_k8s_namespace_name=""} ${i}
EOF
  } | curl -fsS --data-binary @- "${VM}/api/v1/import/prometheus" \
    && echo "ksg-seeder: tick ${i} pushed" \
    || echo "ksg-seeder: tick ${i} failed (VM not ready yet?)"

  sleep "${INTERVAL}"
done
