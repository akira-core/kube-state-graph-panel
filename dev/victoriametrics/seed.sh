#!/bin/sh
# kube-state-graph demo metrics seeder.
#
# Pushes the synthetic topology fixture plus an ever-increasing set of
# traces_service_graph_request_total counters into VictoriaMetrics on a loop.
# The v0.0.13 backend derives the whole graph from PromQL over a [start,end]
# window, so two things must hold continuously:
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
  # Each labelled series below is engineered to land a specific node/edge:
  #
  #   1 frontend -> backend            pod-calls-pod (intra-cluster)
  #   2 frontend -> backend.svc        service node + pod-calls-pod + service-selects-pod
  #   3 backend  -> postgres-0 (headless DNS)  pod-calls-pod resolved to the real pod
  #   4 worker   -> stripe URL         others node + pod-calls-pod
  #   5 legacy-cron -> backend         external node + pod-calls-pod
  #   6 frontend -> analytics (edge)   cross-cluster pod-calls-pod
  {
    cat "${TOPOLOGY}"
    cat <<EOF
traces_service_graph_request_total{cluster="demo",client="shop/frontend",server="shop/backend",client_k8s_pod_uid="u-frontend",server_k8s_pod_uid="u-backend",client_k8s_namespace_name="shop",server_k8s_namespace_name="shop"} ${i}
traces_service_graph_request_total{cluster="demo",client="shop/frontend",server="http://backend.shop.svc.cluster.local",client_k8s_pod_uid="u-frontend",server_k8s_pod_uid="",client_k8s_namespace_name="shop",server_k8s_namespace_name=""} ${i}
traces_service_graph_request_total{cluster="demo",client="shop/backend",server="postgres://postgres-0.postgres.shop.svc.cluster.local:5432",client_k8s_pod_uid="u-backend",server_k8s_pod_uid="",client_k8s_namespace_name="shop",server_k8s_namespace_name=""} ${i}
traces_service_graph_request_total{cluster="demo",client="shop/worker",server="https://api.stripe.com/v1/charges",client_k8s_pod_uid="u-worker",server_k8s_pod_uid="",client_k8s_namespace_name="shop",server_k8s_namespace_name=""} ${i}
traces_service_graph_request_total{cluster="demo",client="legacy-cron",server="shop/backend",client_k8s_pod_uid="",server_k8s_pod_uid="u-backend",client_k8s_namespace_name="",server_k8s_namespace_name="shop"} ${i}
traces_service_graph_request_total{cluster="demo",client="shop/frontend",server="analytics/analytics",client_k8s_pod_uid="u-frontend",server_k8s_pod_uid="u-analytics",client_k8s_namespace_name="shop",server_k8s_namespace_name="analytics"} ${i}
EOF
  } | curl -fsS --data-binary @- "${VM}/api/v1/import/prometheus" \
    && echo "ksg-seeder: tick ${i} pushed" \
    || echo "ksg-seeder: tick ${i} failed (VM not ready yet?)"

  sleep "${INTERVAL}"
done
