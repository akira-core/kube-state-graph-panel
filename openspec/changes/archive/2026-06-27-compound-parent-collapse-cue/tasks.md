## 1. normalize: make decorative groups selectable (TDD)

- [x] 1.1 Update `normalize.test.ts`: change the `cluster` / `namespace` / `application` group-node assertions from `selectable === false` to selectable (no `selectable: false` emitted); run RED.
- [x] 1.2 In `normalize.ts`, drop the `selectable: false` branch for the decorative kinds (retire/empty the `isNonSelectableGroup` gate so cluster/namespace/application are selectable like every other compound parent); update the adjacent comment; run GREEN.
- [x] 1.3 Confirm `controller` / k8s `node` / `storageclass` selectability is unchanged (already selectable) and `pod`/leaf nodes unaffected.

## 2. resolveSelectedNode / panel guard (regression)

- [x] 2.1 Add a `resolveSelectedNode` (or KsgPanel) test: a now-selectable decorative group resolves to `null` (no detail data) — locking the `isDashboardEligible` guard against the selectability change.
- [x] 2.2 Verify no production change is needed in `resolveSelectedNode` / `GraphCanvas.handleTap` (the `!selectable` branch simply no longer fires for groups; `onSelect(groupId)` flows to the guard).

## 3. Verify the collapse cue end-to-end

- [x] 3.1 Confirm the built-in `+/-` cue renders on a selected decorative group (it already renders for selectable parents — `cueEnabled: true` in `useExpandCollapse`); no expand-collapse config change required.
- [x] 3.2 Confirm clicking the cue toggles that parent's collapse and updates `collapsedIds` via the existing cue-event → `onCollapsedChange` path (covered by existing collapse tests; add one if a gap exists for a decorative-group parent).

## 4. Folded decorative group folder icon (TDD)

- [x] 4.1 Add a standalone `FOLDER_ICON_SVG` (XML header, `currentColor`, stroke art) — exported from `iconSvgByKind.ts` (NOT in `ICON_SVG_BY_KIND`, since cluster/namespace/application aren't `NodeKind`).
- [x] 4.2 `getStylesheet.test.ts`: assert collapsed-decorative selectors paint the folder glyph tinted by each accent, expanded stays `'none'`, and a collapsed kind-ful compound keeps its kind icon; run RED.
- [x] 4.3 In `getStylesheet.ts`, add `node[?isCluster].cy-expand-collapse-collapsed-node` / `[?isNamespace]` / `[?isApplication]` rules setting `background-image` to the tinted folder glyph + `background-fit: contain`; run GREEN.
- [x] 4.4 Regenerate the stylesheet snapshot test.

## 5. Spec + validation

- [x] 5.1 Apply the `panel-rendering` delta (互動與選取狀態 MODIFIED + 收合裝飾群組 folder icon ADDED) to `openspec/specs/panel-rendering/spec.md`; reconcile the "Node Detail 面板" wording `cluster 容器不可點選` to "裝飾群組可選取(顯示摺疊 cue)但不開啟 detail 面板".
- [x] 5.2 Run `openspec validate compound-parent-collapse-cue`, then `npm run typecheck`, `npm run lint`, `npm run test:ci`, `npm run build` — all green.
- [x] 5.3 Manual check in the running stack: select each compound parent kind → `+/-` cue appears → click folds/unfolds; selecting a decorative group opens no detail panel; folded cluster/namespace/application show a folder icon.

## 6. Legend panel collapse toggle (TDD)

- [x] 6.1 `KsgPanel.test.tsx`: with `showLegend: true`, assert the legend `<aside>` renders a `<` collapse button (`legend-collapse`); click → `<aside>`/its sections gone + a floating `>` restore button (`legend-expand`) present; click `>` → `<aside>` back, restore button gone; run RED.
- [x] 6.2 `KsgPanel.test.tsx`: with `showLegend: false`, assert neither `legend-collapse` nor `legend-expand` renders; run RED.
- [x] 6.3 In `KsgPanel.tsx` add panel-local `legendCollapsed` `useState(false)`; render the `<` `IconButton` (`angle-left`, `legend-collapse`) on the `LayoutModeControl` "Layout" label row (via a new `action` slot prop, so it costs no extra rail height), hide the `<aside>` when collapsed, and render a floating `>` `IconButton` (`angle-right`, `legend-expand`) over `canvasArea` when collapsed; keep the whole thing under `options.showLegend`; add the floating-button style to `getStyles`; run GREEN.

## 7. Legend-collapse spec + validation

- [x] 7.1 Confirm the `panel-rendering` delta carries the `Legend 面板可收合至側邊` ADDED requirement; apply it into `openspec/specs/panel-rendering/spec.md` on archive.
- [x] 7.2 Run `openspec validate compound-parent-collapse-cue`, then `npm run typecheck`, `npm run lint`, `npm run test:ci`, `npm run build` — all green.
- [x] 7.3 Manual check in the running stack: `<` hides the legend (canvas widens) → floating `>` restores it; with the panel's Show legend option off, no toggle buttons appear. (Caught + fixed a z-index regression: the `.expand-collapse-canvas` overlay at z-index 999 was swallowing the restore click; bumped `legendExpandButton` to z-index 1000.)
