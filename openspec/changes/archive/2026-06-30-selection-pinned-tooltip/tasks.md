# Tasks: selection-pinned-tooltip

TDD throughout: write/adjust the failing test first, then implement.

## 1. `PinnedTooltip` type + hover-tooltip dual mode

- [x] 1.1 Add `export interface PinnedTooltip { label: string; attributes: NodeAttribute[]; labels?: Record<string,string> }` to `HoverTooltip.types.ts` (import `NodeAttribute` from `shared/nodeAttributes`); add `pinned?: PinnedTooltip | null` to `HoverTooltipProps`. Export `PinnedTooltip` from `hover-tooltip/index.ts`.
- [x] 1.2 (RED) In `HoverTooltip.test.tsx` add a `pinned mode` describe: (a) renders a top-right card (`right:8`/`top:8`/`left:auto`, `pointerEvents:'auto'`, `zIndex:1000`); (b) title === `pinned.label` + one row per attribute (incl `kind`) + labels filtered by `NODE_PROMOTED_LABELS`; (c) renders even when `useHoverElement` is mocked to return `null`; (d) suppresses hover (mock hovered + set pinned → pinned shown, hovered content absent); (e) `pinned == null` → existing hover behavior unchanged.
- [x] 1.3 (GREEN) Implement the pinned branch in `HoverTooltip.tsx` per design D2/D3: insert `if (pinned != null) { ... }` before the `hovered === null` guard; reuse `styles.root` + inline overrides; content via `toLabelRows(pinned.labels, NODE_PROMOTED_LABELS)`; add a `data-pinned` marker on the pinned card.

## 2. Thread `pinned` through GraphCanvas

- [x] 2.1 Add `pinned?: PinnedTooltip | null` to `GraphCanvasProps` (import `PinnedTooltip` from the hover-tooltip barrel).
- [x] 2.2 (RED) `GraphCanvas.test.tsx`: passthrough test — `pinned` prop set → pinned card visible with no hovered element.
- [x] 2.3 (GREEN) Forward `pinned={pinned ?? null}` to `<HoverTooltip>`.

## 3. `buildPinnedTooltip` helper + KsgPanel wiring + `labels` passthrough

- [x] 3.1 Add `labels?: Record<string,string>` to `NodeDetailData`; update its doc comment (attributes now feed the pinned tooltip).
- [x] 3.2 (RED) `resolveSelectedNode.test.ts`: add a labels-passthrough case + assert NO `labels` key when `data.labels` absent. Existing exact `toEqual` fixtures (incl. storageclass leaf) stay green.
- [x] 3.3 (GREEN) In `resolveSelectedNode` add `...(d.labels !== undefined ? { labels: d.labels } : {})`. Keep `attributes: buildNodeAttributes(d)`; update its comment.
- [x] 3.4 (RED) Add `buildPinnedTooltip.test.ts`: null→null; attrs+labels→full; attrs/no-labels→`labels` omitted; storageclass leaf→pinned built.
- [x] 3.5 (GREEN) Add `src/panels/KsgPanel/buildPinnedTooltip.ts` per design D5.
- [x] 3.6 In `KsgPanel.tsx`: `const pinned = useMemo(() => buildPinnedTooltip(selectedNode), [selectedNode]);` pass `pinned={pinned}` to `<GraphCanvas>`.

## 4. Drop Properties + content-gate NodeDetailPanel

- [x] 4.1 (RED) `NodeDetailPanel.test.tsx`: DELETE the `Properties section` tests; ADD (a) renders null when no application/containers/alerts/dashboard; (b) header-only panel (Dashboard button + close X, no section testids) when only a ready dashboard exists; (c) guard `queryByTestId('node-detail-section-properties')` is null for an app/containers/alerts node. Keep alerts/application/containers/dashboard/single-scroll suites.
- [x] 4.2 (GREEN) Remove Properties section JSX + `propertyRows` + `kvRow`/`kvKey`/`kvVal` css blocks + their 3 keys in the `getStyles` return-type interface. Add `showDashboard` + the content-gate `return null` per design D7. Keep `staticBody`/`sectionFixed`/`section`/`sectionFill`/`slot`.

## 5. Verify gates + browser

- [x] 5.1 `npm run typecheck` (verify the exactOptionalPropertyTypes conditional-spread compiles).
- [x] 5.2 `npm run lint` (no unused styles after kvRow/kvKey/kvVal removal).
- [x] 5.3 `npm run test:ci`.
- [x] 5.4 `npm run build`.
- [x] 5.5 `npx openspec validate selection-pinned-tooltip --strict`.
- [x] 5.6 Browser verify (per memory `browser-verify-ksg-panel`): left-click a leaf/k8s-node/controller and a storageclass on `/d/ksg-switch-demo` → pinned card appears top-right (attrs + labels), floating hover suppressed, background tap clears it. **7/7 PASS**.

## 6. Panel always renders + Application section for service/pvc (user follow-up)

- [x] 6.1 NodeDetailPanel: remove the content-gate `return null`; panel always renders (header minimum). Broaden `showApplication = node.application !== undefined` (any node with an application); `showContainers` stays workload-only.
- [x] 6.2 `resolveSelectedNode`: give a non-workload node carrying `data.application` a `queryTarget` of its own `{kind, name}` (new `else if`), so `config_changes` fires for service/pvc in an app.
- [x] 6.3 Update tests: NodeDetailPanel (always-renders / header-only bare node / Application-for-service-in-app / no-Containers); resolveSelectedNode (service-with-application → own queryTarget; without → none); KsgPanel (non-workload no-application → header-only panel, no query).
- [x] 6.4 Update spec delta (Node Detail 面板 always-renders; Node Detail Application 與 Containers — Application for any-application node incl service/pvc, Containers workload-only) + proposal + design.
- [x] 6.5 Gates: typecheck ✓ · lint ✓ · test:ci **716** ✓ · build ✓ · openspec validate ✓.
- [x] 6.6 Browser verify **9/9 PASS**: service/mongo-svc → panel + Application section + no Containers + pinned; bare `sw/core` (no app) → header-only panel + close X + no Application + pinned; workload → panel + Application + Containers + pinned.

## 7. Application GROUP node opens its app-detail (user follow-up)

- [x] 7.1 `resolveSelectedNode`: widen the gate to `isDashboardEligible(d) || d.isApplication === true` (cluster/namespace stay excluded); synth `kind: 'application'` for the kind-less group; add an `else if` giving it a `queryTarget` of `{kind:'application', name: d.application}`.
- [x] 7.2 Tests: resolveSelectedNode (app group resolves with synth kind + config_changes target; namespace still null); KsgPanel D6-scope test updated (app group opens).
- [x] 7.3 Spec delta: add MODIFIED `互動與選取狀態` (application group opens, cluster/namespace don't); carve the application group out of Node Detail 面板 + Hover Tooltip "decorative groups don't open/pin"; Node Detail Application 與 Containers — application group fires config_changes with `{kind:'application', name:<app>}`. proposal + design updated.
- [x] 7.4 Gates: typecheck ✓ · lint ✓ · test:ci **717** ✓ · build ✓ · openspec validate ✓.
- [x] 7.5 Browser verify **5/5 PASS**: `prod/app/mongodb` (application group) → panel + Application section + no Containers + pinned (`mongodb · kind:application`) + header badge `application`.
