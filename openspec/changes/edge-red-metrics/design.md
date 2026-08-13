# Design — edge-red-metrics

## Context

Motivation: see `proposal.md` — Why. Behavior contracts: `specs/graph-data-integration/spec.md`, `specs/panel-rendering/spec.md`, `specs/dev-environment/spec.md` (all deltas).

Three constraints shape everything below.

1. **The wire contract is deliberately three-valued per field.** `metrics` absent, `error_rate` absent, and `error_rate: 0` mean three different things upstream (no measurement / counter unreadable / measured-and-clean). The backend's own code comments call this out repeatedly. Any panel-side normalization that collapses them — defaulting to `0`, filling a placeholder — destroys information the operator needs.
2. **Values are rounded to 6 significant digits by the backend, not to a friendly magnitude.** A 30-day query window legitimately yields `rate: 3.86e-7`. Naïve `toFixed(2)` renders that as `0.00`, which reads as "no traffic" — the exact opposite of the truth.
3. **The panel already has a shaped place for this.** `HoverTooltip.buildContent`'s edge branch produces `{ title, attrs, labels }`; `attrs` is an ordered `TooltipRow[]` rendered above the `labels` divider. RED is three more rows in that array — no new component, no new hook, no layout or stylesheet involvement.

The backend feature is on the unmerged branch `add-service-graph-red-metrics` (`dfb375e`, `bee02d7`). Panel work does not depend on that merge; only live demo verification does.

## Goals / Non-Goals

**Goals:**

- Carry `data.metrics` across the normalize boundary with the three-valued semantics intact.
- Render RED in the edge hover tooltip in units a human reads directly (`req/s`, `%`, `ms`/`s`).
- Never let a RED problem cost an edge, an error banner, or a wrong-by-omission `0`.
- Give the local demo real RED data so the feature is verifiable without a cluster.

**Non-Goals:**

- Any canvas encoding of RED (edge width by rate, colour by error rate, on-canvas edge labels). Edge colour is the edge-type legend's single meaning; overloading it needs its own change with a toggle and a second legend.
- Edge selection / a detail panel for edges. The detail panel is node-only today; opening it to edges is a separate capability.
- Thresholds, alerting, sparklines, or history. The panel shows the single window the query already asked for.
- Percentiles other than p90, or client-side latency. The backend hardcodes p90 and emits nothing else.
- A panel option to hide RED. Absence is already driven by the data.

## Decisions

### D1 — Passthrough at the boundary, formatting at the leaf

`normalize.ts` validates and renames (`error_rate → errorRate`, `p90_server_ms → p90ServerMs`, matching the existing `ipaddress → ipAddress` / `type → edgeType` convention) and stops there. It stores **numbers**, not strings, and does no unit conversion.

_Alternative considered:_ format to display strings in normalize, so the tooltip is a dumb renderer. Rejected — it welds a presentation decision into the anti-corruption layer, makes the values untestable as numbers, and blocks any future consumer (canvas encoding, edge detail panel) that needs the magnitude rather than the label.

The formatter is a separate pure module under `hover-tooltip/` with its own unit tests, so the "never render a non-zero value as 0" rule is verified in isolation rather than through DOM assertions.

### D2 — Per-field degradation, with `rate` as the keystone

Bad `errorRate` drops only `errorRate`. Bad or missing `rate` drops the whole `metrics` object, because the contract guarantees `rate` is present whenever `metrics` is — its absence means the object is not a `metrics` object we understand, and the remaining fields have no denominator to be read against. Either way the **edge itself always survives**; RED is an attribute layer, never a gate.

_Alternative considered:_ reject the whole edge on malformed metrics, matching how `parseEdges` treats a missing `id`. Rejected — a missing `id` makes the edge unrenderable; a malformed `rate` makes it merely less informative. Dropping the edge would silently change the topology the operator is looking at.

### D3 — RED problems do not enter the `errors` channel

`normalizeGraph`'s `errors` array surfaces as a user-visible partial-parse banner. That banner means "the topology you are looking at may be incomplete". A malformed metric does not make the topology incomplete, and a systematic upstream regression would fire it on every edge at once, drowning the real topology warnings it exists for.

This is a deliberate, spec'd exception to the project's "never silently swallow errors" rule, scoped to one decorative field. The mitigation is test coverage: the degradation paths are asserted directly on `normalizeGraph`'s output, so a regression fails a test rather than needing to be noticed in a banner.

_Alternative considered:_ a separate non-blocking warning channel. Rejected as premature — one field does not justify a second diagnostics pathway.

### D4 — Formatting: 3 significant digits, escape to exponent rather than to zero

One shared numeric formatter, three unit wrappers.

The core rule is **magnitude preservation**: format to at most 3 significant digits with trailing zeros stripped; if that rounding would turn a non-zero input into a `0` string, emit exponent notation instead. This is what makes `3.86e-7 req/s` legible-as-nonzero and keeps `0%` meaning exactly zero.

`errorRate` multiplies by 100 before formatting — the ratio→percent conversion is the one place a unit changes, and it happens at the display leaf where the `%` suffix is attached, so the two can never drift apart.

`p90` switches to seconds at ≥ 1000 ms. `2.5 s` is read correctly at a glance; `2500 ms` invites a decimal-place miscount.

_Alternative considered:_ Grafana's `@grafana/data` value formatters (`getValueFormat`). Rejected for this change — they bring locale/unit-registry behaviour and their own rounding policy, and none of them implement the "never collapse to zero" rule that constraint 2 makes mandatory. A ~30-line pure function is cheaper to specify and to test than a formatter chain we would have to constrain anyway.

### D5 — Row keys and position

Keys are `rate` / `errorRate` / `p90`, camelCase like the existing `edgeType` / `ipAddress` rows. Units live in the value (`5 req/s`), not the key (`rate (req/s)`), so key column width stays stable across rows.

Position is immediately after `edgeType` and before the `labels` divider: the promoted-attr block is "what the panel knows about this element", the labels block is "what the backend sent verbatim". RED is derived, not a label — and the backend explicitly forbids these values appearing as label keys, so putting them in the labels block would misrepresent the payload.

### D6 — Seeder correctness hinges on byte-identical label sets

The backend joins the three series by exact label-set identity (all labels minus `__name__`; histogram minus `le`). A single extra or misspelled label on the companion series makes the join silently return nothing — `error_rate` and `p90_server_ms` just never appear, with no error anywhere. So the seeder emits the three families from one shared label string per edge rather than three hand-written copies, making divergence structurally impossible rather than merely unlikely.

The histogram is emitted with a small fixed ladder of cumulative `le` boundaries ending in `+Inf`. `classicQuantile` requires ≥ 2 boundaries, a `+Inf` bucket, and a non-zero count; anything less and it returns not-ok and the field is dropped.

Failed counts increment more slowly than totals, so the demo shows an `error_rate` strictly between 0 and 1 rather than the degenerate `0%` or `100%`.

## Risks / Trade-offs

- **Backend branch unmerged** → Panel code and unit tests are built against the documented contract and the backend's golden fixture shape, not against a running backend. End-to-end demo verification is gated on a backend image built from `add-service-graph-red-metrics` (`KSG_BACKEND_TAG` override); until then the demo shows the no-metrics path, which is itself a spec'd behavior worth confirming.
- **Contract drift if the backend adds percentiles or renames fields** → The wire shape is pinned in the `graph-data-integration` delta and mirrored in one normalize function and one type declaration. A rename breaks a named test, not a silent render.
- **Tooltip height growth on edges** → Three extra rows on a 280px-wide card that already scrolls (`overflowY: auto`, capped to the canvas). No new overflow behavior needed; edges carry far fewer labels than nodes.
- **Tiny values in exponent notation are not pretty** → Accepted deliberately. Correct-and-ugly beats pretty-and-wrong; the alternative renders live traffic as `0`. Operators reaching those magnitudes are using a very wide time window, where exponent notation is also the honest signal that the window is the reason.
- **`errorRate` omitted vs `0%` is a subtle distinction a user may miss** → Mitigated by never rendering a placeholder for the omitted case: the row's absence is the signal, and there is no `0%`-looking artifact to confuse it with.

## Migration Plan

Not applicable — additive, optional field; no persisted state, no panel option, no dashboard JSON change. Older backends simply never send `metrics` and the panel renders as it does today. Rollback is reverting the commit.
