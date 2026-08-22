# Design — render-from-fixture-only

## Context

The panel had two demo dashboards with two data paths: `KSG Showcase` parsed a JSON string
embedded in its own dashboard file, and `KSG Demo` issued HTTP requests to a
kube-state-graph container fed by a seeded VictoriaMetrics. This change deletes the second
path and makes the first one load-bearing.

The decisions below are mostly about one question — *if the fixture is the only data source,
what stops it from quietly falling behind the contract it is supposed to represent?* — plus
one correctness question about the two ingress shapes.

## D1 — The fixture is TypeScript, not JSON

**Decision.** `src/shared/fixtures/showcaseGraph.ts` exports a `WireGraph`-typed constant. A
generator compiles it into the dashboard JSON.

**Alternatives rejected.**

- *Keep the inline JSON in the dashboard.* Zero new machinery, but the 16KB string and the
  Jest fixtures then drift independently, and nothing connects either to what normalize can
  read. This is the status quo that let `ready_status` sit unrendered.
- *A `.json` file injected by a script.* Cleaner diffs, no type safety. Rejected because
  type safety is the entire point: with a `WireGraph` annotation, teaching normalize a new
  field and forgetting the fixture is a `tsc` failure. Without it, it is a blank spot on a
  demo nobody re-reads.

**Cost accepted.** A build step between source and demo, and a 750-line data file. The file
is long because it is a graph — splitting it by domain would scatter edges away from the
nodes they connect, which is worse for a fixture than length is.

## D2 — Generated output plus a drift gate, not a runtime import

**Decision.** `npm run fixture:build` writes the dashboard; `npm run fixture:check` fails
when the committed dashboard does not match the fixture. CI and `pre-push` run the check.

Grafana provisioning reads dashboard JSON off disk — there is no hook for the panel to
supply its own demo payload at runtime, and inventing one would put demo-only code in the
production bundle. So the dashboard has to physically contain the data, which means
generated output in git, which means a staleness gate. Without the gate the generator is
merely a suggestion, and the first hand-edit to the dashboard silently forks the two.

**Why compact JSON in the target.** The string is machine-written and machine-read; an
indented payload would multiply the dashboard diff on every fixture edit and bury the one
line that actually changed.

## D3 — The generator is `.mjs` on native type stripping

**Decision.** `dev/buildFixtureDashboard.mjs` imports the `.ts` fixture directly; Node strips
the types.

`tsconfig.json` sets `rootDir: ../src` and `include: ["../src", "./types"]`, so a build
script outside `src/` cannot join the main typecheck project without a second tsconfig and a
second `tsc` invocation — machinery for a 50-line file. `ts-node` is present but needs ESM
loader flags. Native stripping needs neither, matches the existing `dev/*.mjs` convention,
and adds no dependency. `engines: node >= 22` already guarantees it.

The **fixture** is fully typechecked because it lives in `src/`. The glue that copies it into
a JSON file is not, and does not need to be.

## D4 — Coverage is asserted against the canonical maps

**Decision.** `showcaseGraph.test.ts` fails when any key of `ICON_SVG_BY_KIND` or
`EDGE_STYLE_BY_TYPE` has no fixture element.

These are the same maps the stylesheet, the legend, and the filter derive from — the repo's
established single-source pattern. Anchoring coverage there means "add a kind to the map"
and "show it in the demo" are one task, enforced. Checking against the panel's *filterable*
subset (`ALL_KINDS`) was rejected: it excludes the virtual `network` wrapper, which is
exactly the kind of panel-only element most likely to lose coverage unnoticed.

This is what forced three new controllers into the fixture. `daemonset` / `job` / `cronjob`
had icons, legend entries, and colour, and had never appeared in any demo.

## D5 — Panel-only fields stay, labelled

**Decision.** `status`, `alerts`, `time_records`, and the `switch` / `network` kinds with
their fabric edges remain in the fixture, with a header comment recording that **no version
of the backend emits them.**

Removing them would delete demo coverage for a large, working slice of the panel. Leaving
them unlabelled invites the opposite error — someone reading the fixture as a wire sample
and "fixing" the backend spec to match. The wire types carry the same warning on
`WireAlert` and `WireNodeData.status`, so it is visible from either direction.

## D6 — `ingress-lb` is excluded from the ingress set, and that is a correctness rule

**Decision.** `collectIngressNodeIds` matches `role === "ingress-gateway"` exactly.
`ingress-lb` never enters the set, so the toggle cannot hide it and normalize does not dash
it.

The backend marks two shapes with one label key, and they are not symmetric:

| | `ingress-gateway` | `ingress-lb` |
|---|---|---|
| What it is | the routed chain's entry hop (Istio) | the non-Istio LB fallback destination |
| Behind it | gateway pods, then a synthesized hop to the backend service | nothing — no routed backend |
| The caller also has | a **direct** edge to the backend service | nothing else |

Hiding an `ingress-gateway` node removes a detour; the direct edge preserves the dependency.
Hiding an `ingress-lb` node removes the caller's **only** dependency edge — the pod would
render as having no dependencies at all. Dashing has the same asymmetry: a dashed stroke
asserts "this traffic detours around a direct path", which is true of the chain and false of
the fallback.

The behaviour was already correct by exact string matching, but only by accident. It is now
a named constant with its rationale, and a test asserts the match is exact rather than a
prefix — so a future `ingress-gateway-canary`, or a refactor to "any role starting with
`ingress-`", cannot quietly erase a dependency.

The fixture demonstrates both halves side by side: `pod/gateway → service/ingress-svc → …`
is the chain (dashed, hideable, with `pod/gateway → service/mongo-svc` surviving it), and
`pod/reporting → service/nginx-lb` is the fallback — solid, always visible, and that pod's
sole dependency.

## D7 — `ready_status` is a third status axis, not a merge

**Decision.** `readyStatus` is carried and displayed on its own. It does not feed `status`,
`worstStatus`, or any border colour.

Kubernetes' Ready condition and the panel's alert severity answer different questions, and a
node can legitimately be `NotReady` with no alerts firing. Folding one into the other would
make a colour mean two things. A test pins that a node with `ready_status` normalizes
byte-identically to one without it, apart from the field itself.

**Absence is not `Unknown`.** The backend omits the field when the node has no Ready series
at all and reserves the literal `"Unknown"` for a kubelet that has stopped reporting. Padding
absence to `Unknown` would render a scrape gap as a cluster-wide outage. Value guarding
follows `health`: non-empty string, passed through verbatim, so an upstream that grows a
fourth condition value surfaces it rather than vanishing.

## Risks

- **The demo can now be wrong in a way no test catches** — the fixture is authored, not
  observed, so a field whose *shape* we misread from the backend spec renders happily. D4
  bounds this to shape errors within covered kinds; the wire types and their references back
  to `openspec/specs/graph-api/` in the backend repo are the mitigation.
- **Backend contract drift is now silent.** With no image in the loop, a backend change
  produces no local failure. Accepted deliberately: the previous arrangement did not detect
  drift either (it rendered a blank storage half against `:latest` and nobody noticed until
  the storage change went looking), and it cost a three-service stack to not detect it.
