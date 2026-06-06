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
  # Each labelled series below is engineered to land a specific node/edge.
  # Empty server_k8s_pod_uid triggers connection-string ("://") resolution;
  # a populated UID resolves via the topology pod-UID index (recovers the
  # server-side cluster, enabling cross-cluster edges).
  #
  #   1-3 gateway -> mongodb-{0,1,2} headless DNS  pod-calls-pod -> REAL pod (no svc node)
  #   4   gateway -> stripe URL                    others node + pod-calls-pod
  #   5   gateway -> dr/consumer (server UID)       cross-cluster pod-calls-pod
  #   6   consumer -> nats ClusterIP DNS            service node + pod-calls-pod
  #                                                 + service-selects-pod fan-out to nats-0/1/2
  #   7   legacy-cron (no UID) -> gateway           external node + pod-calls-pod
  {
    cat "${TOPOLOGY}"
    cat <<EOF
traces_service_graph_request_total{cluster="prod",client="apps/gateway",server="mongodb://mongodb-0.mongodb.data.svc.cluster.local:27017",client_k8s_pod_uid="u-gateway",server_k8s_pod_uid="",client_k8s_namespace_name="apps",server_k8s_namespace_name=""} ${i}
traces_service_graph_request_total{cluster="prod",client="apps/gateway",server="mongodb://mongodb-1.mongodb.data.svc.cluster.local:27017",client_k8s_pod_uid="u-gateway",server_k8s_pod_uid="",client_k8s_namespace_name="apps",server_k8s_namespace_name=""} ${i}
traces_service_graph_request_total{cluster="prod",client="apps/gateway",server="mongodb://mongodb-2.mongodb.data.svc.cluster.local:27017",client_k8s_pod_uid="u-gateway",server_k8s_pod_uid="",client_k8s_namespace_name="apps",server_k8s_namespace_name=""} ${i}
traces_service_graph_request_total{cluster="prod",client="apps/gateway",server="https://api.stripe.com/v1/charges",client_k8s_pod_uid="u-gateway",server_k8s_pod_uid="",client_k8s_namespace_name="apps",server_k8s_namespace_name=""} ${i}
traces_service_graph_request_total{cluster="prod",client="apps/gateway",server="apps/consumer",client_k8s_pod_uid="u-gateway",server_k8s_pod_uid="u-consumer",client_k8s_namespace_name="apps",server_k8s_namespace_name="apps"} ${i}
traces_service_graph_request_total{cluster="dr",client="apps/consumer",server="nats://nats.messaging.svc.cluster.local:4222",client_k8s_pod_uid="u-consumer",server_k8s_pod_uid="",client_k8s_namespace_name="apps",server_k8s_namespace_name=""} ${i}
traces_service_graph_request_total{cluster="prod",client="legacy-cron",server="apps/gateway",client_k8s_pod_uid="",server_k8s_pod_uid="u-gateway",client_k8s_namespace_name="",server_k8s_namespace_name="apps"} ${i}
EOF
  } | curl -fsS --data-binary @- "${VM}/api/v1/import/prometheus" \
    && echo "ksg-seeder: tick ${i} pushed" \
    || echo "ksg-seeder: tick ${i} failed (VM not ready yet?)"

  sleep "${INTERVAL}"
done
