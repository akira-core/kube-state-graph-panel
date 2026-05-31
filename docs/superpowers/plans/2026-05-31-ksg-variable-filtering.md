# KSG Grafana Variable Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add Grafana dashboard template variables (cluster / namespace / name / edge_type) that filter the KSG graph at the backend `/v1/graph` endpoint via repeated query params, by parameterizing the Infinity query URL — panel code is untouched. No backend image change is required: the currently-pinned `v0.0.14` already supports scope query params + the `/v1/clusters` + `/v1/edge-types` discovery endpoints (verified live against `marz32one/kube-state-graph:v0.0.14` on 2026-05-31).

**Architecture:** This is Feature 1 of the design spec (§1.A, §2.1, §2.2, §3, §4, parts of §8/§9). All work is **provisioning + docs**: add four template variables to `provisioning/dashboards/ksg-demo.json`, and rewrite the single Infinity target URL to append `${var:customqueryparam:<name>:}` segments that expand multi-value selections into repeated `cluster=a&cluster=b` params (NOT the `var-`-prefixed `queryparam`). The panel's `normalizeGraph` is structure-agnostic and renders whatever subgraph the backend returns, so no `.tsx`/`.ts` changes are required. There is no unit-testable code here; each task replaces the TDD red/green cycle with **explicit manual verification** (exact `curl` against the running backend + exact Grafana UI steps + expected JSON output).

**Tech Stack:** Grafana 12.x template variables (Query type via Infinity datasource + Custom type), `yesoreyeram-infinity-datasource` (UQL / JSONata distinct extraction, `customqueryparam` interpolation), Docker Compose, `@grafana/plugin-e2e` (Playwright) for the optional verification spec.

## File Structure

| File                                    | Create/Modify          | Responsibility                                                                                                                |
| --------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `provisioning/dashboards/ksg-demo.json` | Modify (lines 26, 38)  | Add four template variables to `templating.list`; parameterize the Infinity target `url` with `customqueryparam` segments     |
| `README.md`                             | Modify (after line 20) | Document the variable filter and discovery endpoints                                                                          |
| `CLAUDE.md`                             | Modify (lines 57, 59)  | Update Local demo notes for variable-driven query URL (v0.0.14 already supports scope params — no image change needed)        |
| `tests/variable-filter.spec.ts`         | Create                 | Optional Playwright verification: dashboard loads with template variables visible; panel mounts under default (All) selection |

---

### Task 1: Verify the pinned `v0.0.14` backend already supports scope params + discovery endpoints (curl)

**Files:**

- None (verification only — `docker-compose.yaml` is NOT modified; `KSG_BACKEND_TAG` default stays `v0.0.14`)

The currently-pinned `v0.0.14` backend was verified live on 2026-05-31 to already support all required endpoints and scope filtering. This task re-confirms those facts against your running demo before the provisioning work begins.

- [ ] Step 1: Bring up the backend stack:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  docker compose up -d victoriametrics ksg-seeder kube-state-graph
  # give the seeder ~2 ticks so rate()/last_over_time windows are populated
  sleep 25
  ```

- [ ] Step 2: VERIFY discovery endpoints return 200:

  ```bash
  NOW=$(date +%s); FROM=$((NOW - 3600))
  # (a) discovery endpoints — v0.0.14 DOES support these:
  curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8080/v1/clusters"
  curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8080/v1/edge-types"
  # (b) capture exact shapes (used in Tasks 2 and 4 for root selectors):
  curl -s "http://localhost:8080/v1/clusters" | python3 -m json.tool
  curl -s "http://localhost:8080/v1/edge-types" | python3 -m json.tool
  ```

  Expected: both endpoints return `200`. `/v1/clusters` shape: `{ "apiVersion":"v1", "clusters":[ {"name":"dr"}, {"name":"prod"} ] }` (root key `clusters`, array of objects with a `name` field). `/v1/edge-types` shape: `{ "apiVersion":"v1", "edge_types":[ {"type":"pod-runs-on-node",...}, {"type":"pod-mounts-pvc",...}, {"type":"pod-calls-pod",...}, {"type":"service-selects-pod",...} ] }` (root key `edge_types` with underscore, 4 types). Record these for Tasks 2 and 4.

- [ ] Step 3: VERIFY scope filtering reduces node counts as expected:

  ```bash
  NOW=$(date +%s); FROM=$((NOW - 3600))
  # full graph:
  curl -s "http://localhost:8080/v1/graph?start=${FROM}&end=${NOW}" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("full:",len(d["elements"]["nodes"]))'
  # single cluster:
  curl -s "http://localhost:8080/v1/graph?start=${FROM}&end=${NOW}&cluster=dr" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("cluster=dr:",len(d["elements"]["nodes"]))'
  curl -s "http://localhost:8080/v1/graph?start=${FROM}&end=${NOW}&cluster=prod" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("cluster=prod:",len(d["elements"]["nodes"]))'
  # repeated-param OR (both clusters):
  curl -s "http://localhost:8080/v1/graph?start=${FROM}&end=${NOW}&cluster=dr&cluster=prod" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("dr+prod:",len(d["elements"]["nodes"]))'
  # namespace filter:
  curl -s "http://localhost:8080/v1/graph?start=${FROM}&end=${NOW}&namespace=data" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("namespace=data:",len(d["elements"]["nodes"]))'
  # combined AND filter:
  curl -s "http://localhost:8080/v1/graph?start=${FROM}&end=${NOW}&cluster=prod&namespace=data" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("prod+data:",len(d["elements"]["nodes"]))'
  # bogus cluster returns 0:
  curl -s "http://localhost:8080/v1/graph?start=${FROM}&end=${NOW}&cluster=bogus" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("bogus:",len(d["elements"]["nodes"]))'
  # empty cluster= returns FULL graph (NOT zero — no empty-value trap):
  curl -s "http://localhost:8080/v1/graph?start=${FROM}&end=${NOW}&cluster=" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("cluster=empty:",len(d["elements"]["nodes"]))'
  ```

  Expected: `full: 20`; `cluster=dr: 10`; `cluster=prod: 14`; `dr+prod: 20`; `namespace=data: 13`; `prod+data: 9`; `bogus: 0`; `cluster=empty: 20` (empty value = no filter, full graph returned — NOT zero). The AND-across-params behaviour means selecting both `cluster=prod` AND `namespace=data` returns the intersection (9 nodes).

- [ ] Step 4: Tear down to a clean state for later tasks:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  docker compose down
  ```

- [ ] Step 5: No commit (no files changed in this task). Proceed to Task 2.

---

### Task 2: Add the `cluster` template variable (Query → `/v1/clusters`)

**Files:**

- Modify: `provisioning/dashboards/ksg-demo.json` (line 38, `"templating": { "list": [] }`)

`cluster` is the root variable — it has no chained dependency. It is a Query variable backed by the Infinity datasource hitting `GET /v1/clusters`. Multi-value with **Include All = expand to actual values** (NOT a custom `*` all-value, which the backend would treat as a literal name → empty result, design §2.1/§4.2).

- [ ] Step 1: VERIFY-FAIL (confirm the variable does not yet exist). With the current file:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  python3 -c 'import json;d=json.load(open("provisioning/dashboards/ksg-demo.json"));print("templating.list len:",len(d["templating"]["list"]))'
  ```

  Expected: `templating.list len: 0` (no variables yet).

- [ ] Step 2: Replace the empty templating list (line 38) with a list containing the `cluster` variable. `/v1/clusters` returns an **object array** (verified in Task 1 Step 2): `{ "apiVersion":"v1", "clusters":[ {"name":"dr"}, {"name":"prod"} ] }`. Use Infinity's table format with `root_selector: "clusters"` and a `columns` entry that extracts the `name` field so the variable options are `dr`/`prod` (not `[object Object]`).

  Replace:

  ```json
    "templating": { "list": [] },
  ```

  with:

  ```json
    "templating": {
      "list": [
        {
          "name": "cluster",
          "label": "Cluster",
          "type": "query",
          "datasource": { "type": "yesoreyeram-infinity-datasource", "uid": "ksg-default" },
          "query": {
            "refId": "variable-cluster",
            "type": "json",
            "source": "url",
            "format": "table",
            "url": "/v1/clusters",
            "url_options": { "method": "GET" },
            "root_selector": "clusters",
            "columns": [
              { "selector": "name", "text": "name", "type": "string" }
            ]
          },
          "multi": true,
          "includeAll": true,
          "refresh": 1,
          "current": {},
          "options": [],
          "hide": 0
        }
      ]
    },
  ```

  Note: `allValue` is intentionally **omitted** (not set to `""`). With `includeAll: true` and no `allValue`, Grafana expands an "All" selection to every concrete option value (`cluster=prod&cluster=dr`). The backend treats an empty `cluster=` value as no filter (returns the full graph), but omitting `allValue` keeps the All-expansion semantics clean — the `customqueryparam` interpolation with a non-empty-prefix already skips unset variables. The All-expansion behavior is verified end-to-end in Task 6.

- [ ] Step 3: VERIFY-PASS (validate JSON + confirm variable parsed). Run:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  python3 -c 'import json;d=json.load(open("provisioning/dashboards/ksg-demo.json"));v=d["templating"]["list"][0];print("name:",v["name"],"| type:",v["type"],"| multi:",v["multi"],"| includeAll:",v["includeAll"],"| root_selector:",v["query"]["root_selector"])'
  ```

  Expected: `name: cluster | type: query | multi: True | includeAll: True | root_selector: clusters` (valid JSON, no parse error).

- [ ] Step 4: VERIFY-PASS (Grafana UI — variable populates from the backend). Run, then perform the UI steps:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  npm run build && docker compose up -d
  sleep 25
  ```

  UI steps (record results as the manual test evidence):
  1. Open http://localhost:3000 → dashboards → **KSG Demo**.
  2. Confirm a **Cluster** dropdown appears at the top of the dashboard.
  3. Open it and confirm it lists `All`, `prod`, `dr` (the seeded clusters).
  4. Settings → Variables → `cluster` → "Preview of values" shows `prod`, `dr`.

  Expected: the Cluster dropdown is present and lists `prod` and `dr` plus `All`. If empty, re-check the `root_selector` against Task 1 Step 3's curl output and fix it before continuing.

- [ ] Step 5: Commit:
  ```bash
  git add provisioning/dashboards/ksg-demo.json
  git commit -m "feat: provision cluster template variable from /v1/clusters"
  ```

---

### Task 3: Add the `namespace` template variable (Query → distinct from `/v1/graph`, chained on `cluster`)

**Files:**

- Modify: `provisioning/dashboards/ksg-demo.json` (the `templating.list` array)

The backend has no `/v1/namespaces`, so `namespace` is derived as the **distinct** set of `nodes[*].data.labels.namespace` from `/v1/graph`, scoped (chained) by the already-selected `cluster` via a nested `customqueryparam` segment. Seeded namespaces: `apps`, `data`, `messaging`.

- [ ] Step 1: VERIFY-FAIL (confirm the distinct extraction works against the live backend before encoding it). Run:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  docker compose up -d; sleep 25
  NOW=$(date +%s); FROM=$((NOW - 3600))
  # full set distinct namespaces:
  curl -s "http://localhost:8080/v1/graph?start=${FROM}&end=${NOW}" | python3 -c 'import sys,json;d=json.load(sys.stdin);ns=sorted({n["data"]["labels"].get("namespace") for n in d["elements"]["nodes"] if n["data"].get("labels",{}).get("namespace")});print("all-ns:",ns)'
  # chained on cluster=prod:
  curl -s "http://localhost:8080/v1/graph?start=${FROM}&end=${NOW}&cluster=prod" | python3 -c 'import sys,json;d=json.load(sys.stdin);ns=sorted({n["data"]["labels"].get("namespace") for n in d["elements"]["nodes"] if n["data"].get("labels",{}).get("namespace")});print("prod-ns:",ns)'
  ```

  Expected: `all-ns: ['apps', 'data', 'messaging']`; `prod-ns: ['apps', 'data']` (messaging is dr-only) — proves both the distinct extraction and the cluster-chaining. The dashboard variable does not yet exist (`templating.list` length is 1 from Task 2).

- [ ] Step 2: Append the `namespace` variable to `templating.list` (after the `cluster` object, before the closing `]`). The Infinity query uses a UQL `summarize` to dedupe, with the URL chained on `${cluster}`:

  ```json
        ,
        {
          "name": "namespace",
          "label": "Namespace",
          "type": "query",
          "datasource": { "type": "yesoreyeram-infinity-datasource", "uid": "ksg-default" },
          "query": {
            "refId": "variable-namespace",
            "type": "uql",
            "source": "url",
            "format": "table",
            "url": "/v1/graph?start=${__from:date:seconds}&end=${__to:date:seconds}&${cluster:customqueryparam:cluster:}",
            "url_options": { "method": "GET" },
            "uql": "parse-json | scope \"elements.nodes\" | project \"namespace\"=\"data.labels.namespace\" | summarize by \"namespace\" | order by \"namespace\" asc"
          },
          "multi": true,
          "includeAll": true,
          "refresh": 2,
          "current": {},
          "options": [],
          "hide": 0
        }
  ```

  Note: `refresh: 2` = "On time range change" (required because `/v1/graph` is windowed by `${__from}`/`${__to}`). The `${cluster:customqueryparam:cluster:}` segment chains this variable on `cluster`. UQL `summarize by` collapses to distinct namespace values.

- [ ] Step 3: VERIFY-PASS (validate JSON + variable shape). Run:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  python3 -c 'import json;d=json.load(open("provisioning/dashboards/ksg-demo.json"));v=[x for x in d["templating"]["list"] if x["name"]=="namespace"][0];print("type:",v["query"]["type"],"| refresh:",v["refresh"]);print("url:",v["query"]["url"]);print("uql:",v["query"]["uql"])'
  ```

  Expected: prints `type: uql | refresh: 2`, a URL containing `${cluster:customqueryparam:cluster:}`, and the UQL with `summarize by "namespace"` — valid JSON.

- [ ] Step 4: VERIFY-PASS (Grafana UI — chained distinct values). Run, then perform UI steps:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  docker compose up -d; sleep 10
  ```

  UI steps:
  1. KSG Demo dashboard → set **Cluster** = `All`. Confirm **Namespace** dropdown lists `apps`, `data`, `messaging`.
  2. Set **Cluster** = `prod` only. Confirm **Namespace** now lists only `apps`, `data` (messaging disappears — chaining works).
  3. Set **Cluster** = `dr` only. Confirm **Namespace** lists `apps`, `messaging`.

  Expected: namespace options track the selected cluster(s). If `namespace` shows raw JSON or is empty, re-check the `uql` `scope "elements.nodes"` / `project "namespace"="data.labels.namespace"` path against Task 1's node shape (nodes live at `elements.nodes`, each `{ data: { id, name, type, labels } }`) and fix.

- [ ] Step 5: Commit:
  ```bash
  git add provisioning/dashboards/ksg-demo.json
  git commit -m "feat: provision namespace variable (distinct from /v1/graph, chained on cluster)"
  ```

---

### Task 4: Add the `name` (resource) and `edge_type` template variables

**Files:**

- Modify: `provisioning/dashboards/ksg-demo.json` (the `templating.list` array)

`name` mirrors `namespace` but extracts distinct `nodes[*].data.name`, chained on both `cluster` and `namespace` (backend does **exact** match on name, design §4.1). `edge_type` is a small fixed set — provision it as a **Custom** variable with the three backend-supported values to avoid coupling to `/v1/edge-types` shape (design §4.2 allows Custom or Query).

- [ ] Step 1: VERIFY-FAIL (confirm distinct name extraction + the three edge types against the backend). Run:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  docker compose up -d; sleep 25
  NOW=$(date +%s); FROM=$((NOW - 3600))
  # distinct names chained on cluster=prod & namespace=data (should be the mongodb pods + PVCs; NO service node):
  curl -s "http://localhost:8080/v1/graph?start=${FROM}&end=${NOW}&cluster=prod&namespace=data" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("names:",sorted({n["data"]["name"] for n in d["elements"]["nodes"]}))'
  # backend edge-type vocabulary (confirms the 3 custom values are correct):
  curl -s "http://localhost:8080/v1/edge-types" | python3 -m json.tool
  ```

  Expected: `names:` includes `mongodb-0`, `mongodb-1`, `mongodb-2` (pods) + `mongodb-data-mongodb-0/1/2` (PVCs). It does **NOT** include a `mongodb` service node — the seeded mongodb Service is **headless** (`cluster_ip="None"`) so no Service node materialises. The only materialised service node in the demo is `nats` in `dr`/`messaging` (use `cluster=dr&namespace=messaging` if you need to show a service-node name). `/v1/edge-types` returns `{ "apiVersion":"v1", "edge_types":[ {"type":"pod-runs-on-node",...}, {"type":"pod-mounts-pvc",...}, {"type":"pod-calls-pod",...}, {"type":"service-selects-pod",...} ] }` (root key `edge_types`, 4 types). The Custom variable in Step 2 uses only 3 of the 4 — `pod-runs-on-node` is excluded because it is expressed as compound nesting (pod inside k8s node), not a drawn edge; filtering it has no visible effect in the panel.

- [ ] Step 2: Append the `name` and `edge_type` variables to `templating.list` (after the `namespace` object). Add:

  ```json
        ,
        {
          "name": "name",
          "label": "Resource name",
          "type": "query",
          "datasource": { "type": "yesoreyeram-infinity-datasource", "uid": "ksg-default" },
          "query": {
            "refId": "variable-name",
            "type": "uql",
            "source": "url",
            "format": "table",
            "url": "/v1/graph?start=${__from:date:seconds}&end=${__to:date:seconds}&${cluster:customqueryparam:cluster:}&${namespace:customqueryparam:namespace:}",
            "url_options": { "method": "GET" },
            "uql": "parse-json | scope \"elements.nodes\" | project \"name\"=\"data.name\" | summarize by \"name\" | order by \"name\" asc"
          },
          "multi": true,
          "includeAll": true,
          "refresh": 2,
          "current": {},
          "options": [],
          "hide": 0
        },
        {
          "name": "edge_type",
          "label": "Edge type",
          "type": "custom",
          "query": "pod-mounts-pvc,pod-calls-pod,service-selects-pod",
          "multi": true,
          "includeAll": true,
          "current": {},
          "options": [
            { "text": "pod-mounts-pvc", "value": "pod-mounts-pvc", "selected": false },
            { "text": "pod-calls-pod", "value": "pod-calls-pod", "selected": false },
            { "text": "service-selects-pod", "value": "service-selects-pod", "selected": false }
          ],
          "hide": 0
        }
  ```

  Note: `name` chains on both `cluster` and `namespace` via two `customqueryparam` segments. `edge_type` is Custom (3 drawn edge types only — `pod-runs-on-node` is excluded because it is compound nesting, not a drawn edge, so filtering it has no visible effect). Both variables intentionally **omit** `allValue` (as does `cluster` in Task 2) so an "All" selection expands to every concrete value rather than a single empty value. (The backend harmlessly treats `cluster=` empty as no filter, but omitting `allValue` keeps the semantics clean and avoids sending unnecessary empty params.)

- [ ] Step 3: VERIFY-PASS (validate JSON + all four variables present in order). Run:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  python3 -c 'import json;d=json.load(open("provisioning/dashboards/ksg-demo.json"));print("vars:",[v["name"] for v in d["templating"]["list"]]);et=[v for v in d["templating"]["list"] if v["name"]=="edge_type"][0];print("edge_type type:",et["type"],"| query:",et["query"])'
  ```

  Expected: `vars: ['cluster', 'namespace', 'name', 'edge_type']`; `edge_type type: custom | query: pod-mounts-pvc,pod-calls-pod,service-selects-pod`.

- [ ] Step 4: VERIFY-PASS (Grafana UI — name chaining + edge_type fixed options). Run, then UI steps:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  docker compose up -d; sleep 10
  ```

  UI steps:
  1. KSG Demo → Cluster=`prod`, Namespace=`data`. Confirm **Resource name** lists the mongodb pods + PVCs seen in Step 1 (no `mongodb` service node — the Service is headless).
  2. Change Namespace=`apps`. Confirm **Resource name** lists only `gateway`.
  3. Confirm **Edge type** dropdown lists exactly `All`, `pod-mounts-pvc`, `pod-calls-pod`, `service-selects-pod`.

  Expected: name options track cluster+namespace; edge_type shows the three fixed values.

- [ ] Step 5: Commit:
  ```bash
  git add provisioning/dashboards/ksg-demo.json
  git commit -m "feat: provision name (chained distinct) + edge_type (custom) variables"
  ```

---

### Task 5: Parameterize the Infinity panel query URL with `customqueryparam`

**Files:**

- Modify: `provisioning/dashboards/ksg-demo.json` (line 26, the panel target `url`)

Rewrite the single panel target URL so each variable appends a backend-readable repeated-param segment. Must use `customqueryparam` with a **custom param name + empty value-prefix** (`${cluster:customqueryparam:cluster:}`) so multi-value `['prod','dr']` expands to `cluster=prod&cluster=dr` — NOT the standard `queryparam`, which would emit the `var-`-prefixed `var-cluster=...` the backend cannot read (design §4.3).

- [ ] Step 1: VERIFY-FAIL (confirm the current URL has no variable segments). Run:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  python3 -c 'import json;d=json.load(open("provisioning/dashboards/ksg-demo.json"));print(d["panels"][0]["targets"][0]["url"])'
  ```

  Expected (current): `/v1/graph?start=${__from:date:seconds}&end=${__to:date:seconds}` — no `customqueryparam`.

- [ ] Step 2: Replace the panel target URL on line 26. Change:

  ```json
          "url": "/v1/graph?start=${__from:date:seconds}&end=${__to:date:seconds}",
  ```

  to (single line — Grafana stores it as one string):

  ```json
          "url": "/v1/graph?start=${__from:date:seconds}&end=${__to:date:seconds}&${cluster:customqueryparam:cluster:}&${namespace:customqueryparam:namespace:}&${name:customqueryparam:name:}&${edge_type:customqueryparam:edge_type:}",
  ```

- [ ] Step 3: VERIFY-PASS (validate JSON + URL contains all four segments). Run:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  python3 -c 'import json;u=json.load(open("provisioning/dashboards/ksg-demo.json"))["panels"][0]["targets"][0]["url"];assert all(s in u for s in ["cluster:customqueryparam:cluster","namespace:customqueryparam:namespace","name:customqueryparam:name","edge_type:customqueryparam:edge_type"]),"missing segment";print("OK:",u)'
  ```

  Expected: prints `OK:` followed by the full URL with all four `customqueryparam` segments — no AssertionError.

- [ ] Step 4: VERIFY-PASS (Grafana UI — multi-value expands to repeated params; the load-bearing `customqueryparam` empty-prefix test on the target Grafana version). Run, then UI steps:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  docker compose up -d; sleep 10
  # record the Grafana version under test (design §4.3 requires logging it):
  curl -s http://localhost:3000/api/health | python3 -m json.tool
  ```

  UI steps (this is the spec-mandated `customqueryparam` multi-value verification, design §4.3/§9):
  1. KSG Demo dashboard → set **Cluster** = `prod` + `dr` (multi-select both).
  2. Open the panel → Edit → Query inspector → **Query** tab (or browser DevTools → Network → the `/v1/graph` request).
  3. Confirm the outgoing request URL contains `cluster=prod&cluster=dr` (two repeated params, **no** `var-` prefix, **no** empty `cluster=`).
  4. Set Cluster=`prod`, Namespace=`data`, and pick one **Resource name** = `mongodb-0`. Confirm the request contains `cluster=prod&namespace=data&name=mongodb-0` and the panel renders only the mongodb-0 subgraph.
  5. Set Edge type = `pod-mounts-pvc`. Confirm `edge_type=pod-mounts-pvc` appears and the rendered graph drops `pod-calls-pod`/`service-selects-pod` edges.

  Expected: repeated params with the custom (un-prefixed) name expand correctly on this Grafana version; the panel renders the scoped subgraph. **Record the Grafana version from the curl above** in the docs (Task 6). If the empty-value-prefix variant emits a `var-` prefix or otherwise misbehaves on this version, STOP and fall back per Task 5 Step 4b.

- [ ] Step 4b: FALLBACK (only if Step 4 shows the empty value-prefix variant fails on this Grafana version). Per design §4.3 fallback B is a backend change (out of scope); the in-panel fallback is to drop the failing variable's segment and document the limitation. If a single variable misbehaves, remove only its `&${<var>:customqueryparam:<var>:}` segment from the URL and note it in Task 6's docs. Re-run Step 3 + Step 4 to confirm the remaining segments still expand. (Skip this step entirely if Step 4 passed.)

- [ ] Step 5: Commit:
  ```bash
  git add provisioning/dashboards/ksg-demo.json
  git commit -m "feat: parameterize Infinity query URL with customqueryparam scope segments"
  ```

---

### Task 6: Verify All / empty-value handling end-to-end

**Files:**

- (no file changes — this is a behavioral verification task that locks in the design §4.3 All/empty semantics before docs)

`customqueryparam` skips a variable that resolves to no value, so an **unselected** variable should emit no segment (no empty `cluster=`), and **All** should expand to every actual value (equivalent to no filter). The backend already treats `cluster=` (empty value) as no filter (returns the full graph — verified in Task 1 Step 3), so even a stray empty param is harmless. This task confirms the correct expansion behavior in Grafana's interpolation layer.

- [ ] Step 1: VERIFY-FAIL baseline (record full unfiltered node count for comparison). Run:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  docker compose up -d; sleep 25
  NOW=$(date +%s); FROM=$((NOW - 3600))
  curl -s "http://localhost:8080/v1/graph?start=${FROM}&end=${NOW}" | python3 -c 'import sys,json;print("FULL node count:",len(json.load(sys.stdin)["elements"]["nodes"]))'
  ```

  Expected: prints the full node count (record it as N_full).

- [ ] Step 2: (no implementation change — verification only). Skip to Step 3.

- [ ] Step 3: VERIFY-PASS (Grafana UI — All expands to repeated **concrete** params; deselect either drops the segment or emits a harmless empty value). UI steps via DevTools → Network panel on the outgoing `/v1/graph` request:
  1. Set **all four** variables to `All`. Inspect the outgoing request URL: confirm it contains repeated **concrete** values `cluster=prod&cluster=dr`, `namespace=apps&namespace=data&namespace=messaging`, all names, all three edge_types. This is the load-bearing check that omitting `allValue` (Tasks 2-4) makes Include All expand to every concrete value rather than a single empty value. Confirm the panel renders the **full** graph (node count == N_full from Step 1).
  2. **Clear** the Cluster selection entirely (deselect All and every value, if the picker allows). Inspect the request: the `cluster` segment should either be absent or, if the picker sends `cluster=` (empty), confirm the panel still renders the full graph (the backend treats empty value as no filter — verified in Task 1 Step 3).
  3. Confirm that with everything `All`, the rendered graph is identical to opening the dashboard fresh (the variables are a no-op when All-selected).

  Expected: All-selection emits repeated concrete params (`cluster=prod&cluster=dr`) and renders the full graph. A cleared variable either drops its segment or sends an empty value that the backend ignores — either way the panel renders correctly. If All emits an empty `cluster=` and the graph unexpectedly goes empty, confirm the variable's `allValue` is omitted (not `""`) and re-verify.

- [ ] Step 4: VERIFY-PASS (confirm no regression on default load). Reload the dashboard with no manual selection (provisioned defaults). Confirm the panel renders the full graph (node count == N_full) — i.e., the added variables do not break the out-of-the-box demo.
      Expected: default dashboard load shows the full topology exactly as before the change.

- [ ] Step 5: Commit (this task may produce a small `current`-default tweak in the JSON if Step 3 required it; otherwise commit nothing and proceed). If the JSON changed:
  ```bash
  git add provisioning/dashboards/ksg-demo.json
  git commit -m "fix: default template variables to All for clean no-filter semantics"
  ```

---

### Task 7: Update README + CLAUDE.md docs

**Files:**

- Modify: `README.md` (after line 20, the "auto-provisioned dashboard" paragraph)
- Modify: `CLAUDE.md` (lines 53, 57, 59, 67 — Local demo section)

Document the variable filter, the discovery endpoints, and the new query URL. No image change is needed — `v0.0.14` already supports scope params + discovery endpoints, so the existing `KSG_BACKEND_TAG` default is unchanged.

- [ ] Step 1: VERIFY-FAIL (confirm docs still lack variable filter mention). Run:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  grep -c "customqueryparam\|template variable" README.md CLAUDE.md
  ```

  Expected: `grep -c` reports `0` matches for the variable-filter terms in both files.

- [ ] Step 2: README — add a "Variable filtering" note after the auto-provisioned dashboard paragraph (after line 20). Replace:

  ```markdown
  The `KSG Demo` dashboard is auto-provisioned and opens with one configured `Kube State Graph` panel.
  ```

  with:

  ```markdown
  The `KSG Demo` dashboard is auto-provisioned and opens with one configured `Kube State Graph` panel.

  ### Variable filtering

  The demo dashboard exposes four template variables that filter the graph **at the backend** (`/v1/graph` scope query params): `cluster`, `namespace`, `name` (resource), and `edge_type`. They are chained — `namespace` is scoped by the selected `cluster`, and `name` by both. Multi-value selections expand to repeated query params (e.g. `cluster=prod&cluster=dr`) via Grafana's `${var:customqueryparam:<name>:}` interpolation; `All` expands to every actual value (no filter). `cluster` values are sourced from the backend discovery endpoint `GET /v1/clusters` (returns `{ "clusters": [{"name":"dr"}, {"name":"prod"}] }`); `edge_type` is a fixed Custom variable with the 3 drawn edge types. The `v0.0.14` backend already implements scope params and discovery endpoints — no image change is required. Panel-side `node kind` / `edge type` visibility filters (panel options) are independent and stack on top of the backend filter.
  ```

- [ ] Step 3: CLAUDE.md — update two references. Apply these exact edits (lines 59, 67):

  Line 59 — extend the dashboard-query bullet to mention the scope params:

  ```markdown
  - The dashboard query is `/v1/graph?start=${__from:date:seconds}&end=${__to:date:seconds}` — the backend's `start`/`end` accept Unix **seconds** or RFC 3339, not millis.
  ```

  →

  ```markdown
  - The dashboard query is `/v1/graph?start=${__from:date:seconds}&end=${__to:date:seconds}` plus four scope segments `&${cluster:customqueryparam:cluster:}&${namespace:…}&${name:…}&${edge_type:…}` driven by template variables — multi-value selections expand to repeated params (`cluster=prod&cluster=dr`), `All` expands to all actual values. The backend's `start`/`end` accept Unix **seconds** or RFC 3339, not millis; scope filtering is in-memory projection (design §2.1).
  ```

  Line 67 — append a clarifying note about the discovery endpoints after the existing "Image tags are overridable" sentence:

  ```markdown
  Image tags are overridable via `KSG_BACKEND_TAG` / `VM_TAG` / `CURL_TAG`.
  ```

  →

  ```markdown
  Image tags are overridable via `KSG_BACKEND_TAG` / `VM_TAG` / `CURL_TAG`. The `v0.0.14` backend already supports scope query params (`cluster=`, `namespace=`, `name=`, `edge_type=`) and the discovery endpoints `GET /v1/clusters` + `GET /v1/edge-types` — no image change is required for variable filtering.
  ```

- [ ] Step 4: VERIFY-PASS (docs updated). Run:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  grep -c "customqueryparam" README.md CLAUDE.md
  grep -c "v1/clusters\|v1/edge-types" README.md CLAUDE.md
  ```

  Expected: `customqueryparam` matches `>= 1` in both files; discovery endpoints matched in both. Visually confirm the two CLAUDE.md edits read correctly.

- [ ] Step 5: Commit:
  ```bash
  git add README.md CLAUDE.md
  git commit -m "docs: document Grafana variable filtering + v0.0.14 scope param support"
  ```

---

### Task 8: Optional Playwright verification spec

**Files:**

- Create: `tests/variable-filter.spec.ts`
- Test path: `tests/variable-filter.spec.ts` (run via `npm run e2e`, requires Grafana + backend running)

A minimal `@grafana/plugin-e2e` spec that asserts the template variables are present on the provisioned dashboard and the panel still mounts under the default (All) selection. This mirrors the existing `tests/panel.spec.ts` pattern (uses `readProvisionedDashboard` + `gotoPanelEditPage`). E2E is developer-triggered (not in CI), so this is the automated companion to the Task 5/6 manual checks.

- [ ] Step 1: Write the failing test:

  ```ts
  import { test, expect } from '@grafana/plugin-e2e';

  test('KSG demo dashboard exposes the cluster/namespace/name/edge_type template variables', async ({
    gotoDashboardPage,
    readProvisionedDashboard,
  }) => {
    const dashboard = await readProvisionedDashboard({ fileName: 'ksg-demo.json' });
    const dashboardPage = await gotoDashboardPage(dashboard);

    // Each provisioned variable renders a submenu label on the dashboard.
    for (const label of ['Cluster', 'Namespace', 'Resource name', 'Edge type']) {
      await expect(
        dashboardPage.getByGrafanaSelector(`Dashboard template variables submenu Label ${label}`)
      ).toBeVisible();
    }
  });

  test('KSG panel mounts under default (All) variable selection', async ({
    gotoPanelEditPage,
    readProvisionedDashboard,
  }) => {
    const dashboard = await readProvisionedDashboard({ fileName: 'ksg-demo.json' });
    const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });
    // With variables defaulting to All, the panel renders the graph (or empty state) — proving the
    // customqueryparam URL did not break the request.
    await expect(panelEditPage.panel.locator.getByTestId(/graph-canvas|empty-state/)).toBeVisible();
  });
  ```

- [ ] Step 2: This spec is a **regression guard**, not a TDD RED step. Because the provisioning from Tasks 2-5 is already committed by the time this task runs, the spec runs GREEN here — there is no artificial-failure dance (no `git stash`). The submenu-label selector (`getByGrafanaSelector('Dashboard template variables submenu Label <label>')`) maps to the real `submenuItemLabels` selector in `@grafana/e2e-selectors`, so the assertions genuinely fail on a dashboard without the variables. (If you want a true RED, author and run this spec **before** committing Tasks 2-5; otherwise just proceed to Step 3/4 and confirm GREEN.)

- [ ] Step 3: (no implementation code — the implementation is the provisioning from Tasks 2-5). Ensure the full stack is up:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  npm run build && docker compose up -d && sleep 25
  ```

- [ ] Step 4: Run the test to verify it passes:

  ```bash
  cd /Users/marz/Develop/tools/kube-state-graph-panel
  npm run e2e -- tests/variable-filter.spec.ts
  ```

  Expected: PASS — both tests green (variables visible; panel mounts under All).

- [ ] Step 5: Commit:
  ```bash
  git add tests/variable-filter.spec.ts
  git commit -m "test: e2e verification of dashboard template variables + panel mount"
  ```

---

## Notes for the implementer

- **rtk shell proxy caveat:** This environment's Bash runs through an `rtk` proxy that can summarize/mangle `cat`/`grep`/`git` output. When a verification step's output looks corrupted, re-read files with the Read tool and pipe command output to a file then Read it.
- **JSON shapes (verified in Task 1):** `/v1/clusters` returns `{ "apiVersion":"v1", "clusters":[ {"name":"dr"}, {"name":"prod"} ] }` — root key `clusters`, object array with `name` field; use `root_selector: "clusters"` + `columns: [{ "selector":"name", "text":"name", "type":"string" }]`. `/v1/edge-types` returns `{ "apiVersion":"v1", "edge_types":[ {"type":"pod-runs-on-node",...}, ... ] }` — root key `edge_types` (underscore), 4 types; the Custom `edge_type` variable uses only the 3 drawn types (excludes `pod-runs-on-node`).
- **UQL vs JSONata:** Tasks 3-4 use Infinity UQL `summarize by` for distinct extraction. If UQL `summarize` does not dedupe as expected on this Infinity version, switch the variable `query.type` to `"json"` with a JSONata `$distinct(...)` parser (design §4.2 names both). Verify in the Grafana variable "Preview of values".
- **No panel code changes:** Per design §4.4, `normalizeGraph` is structure-agnostic; the panel renders whatever subgraph the backend returns. Do not modify `src/**` for this feature. `KsgPanel`'s existing `elements.length===0 → No graph data` path already handles a heavily-filtered empty result.
- **Scope boundary:** This plan implements ONLY Feature 1 (Grafana variable filtering). Feature 2 (compound-node collapse via `cytoscape-expand-collapse`) and Feature C (visual reshape) are explicitly out of scope here.
