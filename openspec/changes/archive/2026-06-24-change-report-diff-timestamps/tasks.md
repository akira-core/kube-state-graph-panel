## 1. 解析層:時間戳抽取(best-effort,沿用 anti-corruption)

- [x] 1.1 (RED)擴充 `useNodeDetailUrls.test.ts`(`parseApplicationUrl` 取向):成功 payload `{ url, current_time, previous_time }`(皆 RFC 3339 字串)→ `ready` 攜帶 `url` + 原字串 `currentTime` / `previousTime`;缺兩時間戳(僅 `{ url }`)→ `ready` 有 `url`、**不帶** `currentTime` / `previousTime` 鍵(非賦 `undefined`,符 `exactOptionalPropertyTypes`);`current_time` 為非字串 / 空字串 → 該欄丟棄、`url` 仍保留(`ready`);non-object payload → 仍為 shape mismatch(`unavailable`,`url` 是可用唯一判準)
- [x] 1.2 (RED)擴充 `useNodeDetailUrls.test.ts`(`parseUrlByContainer` 取向):`code_changes` 回 `{ app: { url, current_time, previous_time } }` → `byName.app` 為 `ready` 攜帶三欄;某 entry 僅 `{ url }` → 該列 `ready` 不帶兩時間;某 entry 時間戳非字串 → 丟棄該欄、保留 url;某 entry 缺 `url`(malformed)→ 整列丟棄(`byName` 無此 key)
- [x] 1.3 (GREEN)`parseApplicationUrl` 改回 `{ url: string; currentTime?: string; previousTime?: string } | undefined`:沿用 `isPlainObject` + `url` 非空字串判準;另抽 `current_time` / `previous_time`,各僅當為非空字串時以原 RFC 3339 字串保留,否則**不設該鍵**(`...(cond ? { currentTime } : {})`);MUST NOT 在此轉 `Date` / `DateTime`(原字串透傳)
- [x] 1.4 (GREEN)`parseUrlByContainer` 的 flat map 元素由 `string` 改為 `{ url: string; currentTime?: string; previousTime?: string }`:逐 entry 沿用 `isPlainObject` + `url` 非空字串守衛(無 url 即丟該 entry),再以同規則抽兩時間戳並不設缺漏鍵;flat map 維持 null-proto;回傳型別更新

## 2. 狀態形狀:DetailLookup ready 變體攜時間戳(design D2)

- [x] 2.1 (RED)擴充 `useNodeDetailUrls.test.ts`(hook 整合):eager 成功 → `application` 為 `{ status:'ready', url, currentTime, previousTime }`、`containers.byName[name]` 同形;後端缺兩時間戳 → `ready` 不帶兩鍵;`loading` / `unavailable` 變體不帶時間;`code_changes` 內部 `codeResult.map` 新元素形狀(`{ url, currentTime?, previousTime? }`)
- [x] 2.2 (GREEN)`DetailLookup` 的 `ready` 變體由 `{ status:'ready'; url:string }` 擴為 `{ status:'ready'; url:string; currentTime?:string; previousTime?:string }`;`loading` / `unavailable` 不變;更新檔頭註解
- [x] 2.3 (GREEN)`useNodeDetailUrls` 內部串接:`codeResult` 的 `map` 型別由 `Record<string, string>` 改為 `Record<string, { url:string; currentTime?:string; previousTime?:string }>`;`config_changes` 成功時把 `parseApplicationUrl` 三欄寫入 `appResult` 的 `ready`(以 `...(cond ? {} : {})` 不寫缺漏鍵);`containers` 的 `useMemo` 在組 `byName` 時把三欄一併寫入 `ready` 項;`EMPTY_BY_NAME` / `IDLE_NODE_DETAIL_LOOKUPS` 不變
- [x] 2.4 確認 cytoscape `data` 型別(`src/shared/types/cytoscape.d.ts`)、`NodeDetailData`(`queryTarget` / `containers`)與傳輸層 **不受影響**——時間戳僅存在於查詢回傳的解析狀態,不入 cytoscape element data

## 3. 顯示格式化 helper:`formatChangeTime`(design D3)

- [x] 3.1 (RED)新增 `formatChangeTime.test.ts`(straight Jest):正常 RFC 3339 UTC(如 `2026-06-16T10:30:00Z`)+ `timeZone:'utc'` → 在地化絕對時間字串(如 `2026-06-16 10:30:00`);`undefined` / 空字串 → `undefined`;非法字串(`"not-a-date"`)→ `undefined`(MUST NOT 回 `Invalid date`);`timeZone` 缺省路徑(採 Grafana 預設)
- [x] 3.2 (GREEN)新增純函式 `formatChangeTime(iso: string | undefined, timeZone?: string): string | undefined`,共置於 `node-detail` feature:`iso` 為 `undefined` / 空字串 → `undefined`;否則以 `@grafana/data` `dateTimeFormat(iso, timeZone !== undefined ? { timeZone } : {})` 格式化;對 `dateTimeFormat` 判定非法(`'Invalid date'` 哨兵 / `dateTime(iso)` 非 `isValid()`)的輸入收斂為 `undefined`;沿用 `AlertTable` 的 `timeZone` 傳法慣例

## 4. 時間 cell:`ChangeTimeCell`(design D6)

- [x] 4.1 (RED)新增 `ChangeTimeCell.test.tsx`(`@testing-library/react`):傳入已格式化字串 + ISO `title` → 渲染該字串、`title` 為 ISO 原字串;`formatted` 為 `undefined` → 渲染 muted「—」且**無** `title`
- [x] 4.2 (GREEN)新增共用 presentational `ChangeTimeCell`(共置 `node-detail`,與 `ChangeReportCell` 同層):props 約 `{ formatted?: string; title?: string }`(由表格先以 `formatChangeTime` 算好 `formatted`、ISO 原字串作 `title` 傳入,cell 不重複呼叫 `dateTimeFormat`);`formatted` 有值 → 渲染值 + `title=ISO`;無值 → muted「—」(`themeColors(theme).text.secondary`)、無 `title`;`useStyles2` + emotion 樣式
- [x] 4.3 (GREEN)新增 `ChangeTimeCell/index.ts` barrel(僅 re-export `ChangeTimeCell` + props 型別)

## 5. ApplicationTable:新增 Current / Previous 欄 + header 正名

- [x] 5.1 (RED)擴充 `ApplicationTable.test.tsx`:斷言欄序為 **Name / Current / Previous / Deployment Changes**;連結欄 header 文字為「Deployment Changes」(MUST NOT 「Change Report」);`state` 為 `ready` 帶兩時間戳 → Current / Previous 欄各顯示依 `timeZone` 格式化的在地化絕對時間、`title`=ISO,同列 `application-url-link` anchor 不受影響;`ready` 缺兩時間戳 → 兩欄各顯示 muted「—」、anchor 照常
- [x] 5.2 (GREEN)`ApplicationTable.types.ts`:props 新增 `timeZone?: string`(註解:依面板 timeZone 格式化兩時間欄)
- [x] 5.3 (GREEN)`ApplicationTable.tsx`:`columns` 在 `url` 欄前插入 `current` / `previous` 兩欄(皆 `disableGrow`),cell 以 `formatChangeTime(state.status==='ready' ? state.currentTime : undefined, timeZone)` 推導 `formatted`、以原 ISO 作 `title` 傳給 `ChangeTimeCell`;`url` 欄 `header` 由「Change Report」改為「Deployment Changes」、維持最右 `disableGrow`;`columns` memo deps 加 `timeZone`;更新檔頭註解
- [x] 5.4 (GREEN)`ApplicationTable` 右對齊 CSS 確認:連結欄仍為 last-child,既有 `& th:last-child { textAlign:'right' }` 對連結欄 header 持續成立(無需改);`current` / `previous` 兩時間欄沿用 InteractiveTable 預設(左對齊),MUST NOT 加破壞 last-child 規則的對齊

## 6. ContainerTable:新增 Current / Previous 欄 + header 正名

- [x] 6.1 (RED)擴充 `ContainerTable.test.tsx`:斷言欄序為 **Name / Image / Current / Previous / Code Changes**;連結欄 header 文字為「Code Changes」(MUST NOT 「Change Report」);某列 `ready` 帶兩時間戳 → 該列 Current / Previous 顯示在地化絕對時間、`title`=ISO,該列 `container-url-link` 不受影響;`ready` 缺兩時間戳 → 兩欄 muted「—」、anchor 照常;`loading` / map 缺項列 → 兩時間欄 muted「—」
- [x] 6.2 (GREEN)`ContainerTable.types.ts`:props 新增 `timeZone?: string`
- [x] 6.3 (GREEN)`ContainerTable.tsx`:`columns` 在 `url` 欄前插入 `current` / `previous` 兩欄(皆 `disableGrow`),cell 以 `rowLookup(lookups, name)` 取該列 `DetailLookup`,再以 `formatChangeTime(lookup.status==='ready' ? lookup.currentTime : undefined, timeZone)` 推導 `formatted` / ISO `title` 傳給 `ChangeTimeCell`;`url` 欄 `header` 由「Change Report」改為「Code Changes」、維持最右 `disableGrow`;`columns` memo deps 加 `timeZone`;`name` 欄 nowrap / `image` 欄行為不變;更新檔頭註解
- [x] 6.4 (GREEN)`ContainerTable` 右對齊 CSS 確認(同 5.4):連結欄維持 last-child,既有 `th:last-child` 右對齊規則不動

## 7. 串接:NodeDetailPanel(timeZone 下傳兩表格)

- [x] 7.1 (RED)擴充 `NodeDetailPanel.test.tsx`:detail view 注入 `timeZone` + 帶時間戳的 `lookups` → 驗證 `ApplicationTable` / `ContainerTable` 收到 `timeZone` 且 Current / Previous 欄呈現格式化時間;省略 `timeZone` → 兩表格採預設時區(不報錯)
- [x] 7.2 (GREEN)`NodeDetailPanel.tsx`:Application 區塊以 `<ApplicationTable application={…} state={lookupsState.application} {...(timeZone !== undefined ? { timeZone } : {})} />` 下傳;Containers 區塊同以 `...(timeZone !== undefined ? { timeZone } : {})` 下傳;`NodeDetailPanel.types.ts` 既有 `timeZone?: string`(用於 AlertTable)沿用,無需新增;確認 `KsgPanel → NodeDetailPanel` 既有 `timeZone` 傳遞不變(僅延伸到兩 detail 表格)

## 8. barrel 與既有測試更新

- [x] 8.1 (GREEN)`node-detail/index.ts` barrel:re-export `ChangeTimeCell`(若需跨 feature 公開)與 `formatChangeTime`(視測試 import 路徑而定);確認 `DetailLookup` 公開型別變更不破壞外部 import
- [x] 8.2 (GREEN)更新 `KsgPanel.test.tsx` 右鍵-detail 整合:既有右鍵預取 → anchor 斷言不變;`timeZone:'utc'`(既有 base props)下,resolve 後 Current / Previous 欄呈現格式化時間(若整合層斷言時間欄)
- [x] 8.3 (GREEN)確認既有 `useNodeDetailUrls` / 兩表格 / `ChangeReportCell` 既有 anchor / 三態 / 快取測試**全數仍綠**(時間戳為新增,連結欄行為不變)

## 9. 規格同步

- [x] 9.1 `openspec validate change-report-diff-timestamps --strict` 通過
- [x] 9.2 確認 `specs/panel-rendering/spec.md` delta(欄序 Name/Current/Previous/Deployment Changes、Name/Image/Current/Previous/Code Changes;header 正名;時間欄在地化絕對時間 + ISO `title` + muted「—」降級;best-effort 互不影響;RFC 3339 UTC 契約)與實作一致
- [x] 9.3 確認元件檔頭 / 程式碼註解與更新後規格一致(連結欄 header 文字、兩時間欄職責、best-effort 降級描述)

## 10. 品質閘 + 驗證

- [x] 10.1 `npm run typecheck` 通過(`exactOptionalPropertyTypes` 下兩 optional 時間鍵 MUST NOT 被賦 `undefined`)
- [x] 10.2 `npm run lint`(zero-warning)通過
- [x] 10.3 `npm run test:ci` 全綠(含新 `formatChangeTime` / `ChangeTimeCell` / 兩表格 / hook 擴充測試)
- [x] 10.4 `npm run build` 成功並更新 `dist/`
- [x] 10.5 demo 手動 / Playwright 驗證:右鍵 pod/controller → Application 區塊欄序為 Name / Current / Previous / Deployment Changes、Containers 為 Name / Image / Current / Previous / Code Changes;header 文字正名確認;後端有時間戳時兩欄顯示在地化絕對時間(`title`=ISO)、缺時間戳時 muted「—」且 anchor 不受影響。**待辦**:demo backend 目前 `config_changes`/`code_changes` 404,且尚未回傳 `current_time`/`previous_time`——需後端交付後才驗證得了時間欄(無時間戳時降級為「—」可先驗)

## 13. 變更型別欄:result_type → Change Type(僅 Containers,design D8)

- [x] 13.1 (RED)新增 `src/shared/constants/colorByResultType.test.ts`(straight Jest):六個已知值(`UNCHANGED`/`UPDATED`/`REPLACED`/`ADDED`/`REMOVED`/`RENAMED`)各回對應 hex;未知值(如 `"MIGRATED"`)回 `FALLBACK_RESULT_TYPE_COLOR`(中性灰);**大小寫不敏感**(`resultTypeColor('updated') === resultTypeColor('UPDATED')`)
- [x] 13.2 (GREEN)新增 `src/shared/constants/colorByResultType.ts`(鏡像 `colorBySeverity`):`RESULT_TYPES` const tuple + `ResultType` type;`RESULT_TYPE_COLOR: Record<ResultType, string>`(hardcoded hex:ADDED `#73BF69` / REMOVED `#E02F44` / UPDATED `#3274D9` / REPLACED `#FF9830` / RENAMED `#B877D9` / UNCHANGED `#8E8E8E`);`FALLBACK_RESULT_TYPE_COLOR`(中性灰);`resultTypeColor(type: string): string` 以 `type.toUpperCase()` 查 map、未知回 fallback、永不拋錯 / 不回空
- [x] 13.3 (RED)擴充 `useNodeDetailUrls.test.ts`(`parseUrlByContainer` 取向):`code_changes` 回 `{ app: { url, result_type: 'UPDATED' } }` → `byName.app` 為 `ready` 攜帶 `resultType: 'UPDATED'`;某 entry 僅 `{ url }` → 不帶 `resultType` 鍵(`Object.hasOwn` 為 false,符 `exactOptionalPropertyTypes`);`result_type` 為非字串 / 空字串 → 丟棄該欄、保留 url;`config_changes`(application)成功 → `ready` **不帶** `resultType` 鍵(僅 containers 契約)
- [x] 13.4 (GREEN)`useNodeDetailUrls.ts`:`ChangeReportDetail` 與 `DetailLookup` 的 `ready` 變體各加 `resultType?: string`;container 內部 map 元素擴為 `{ url, currentTime?, previousTime?, resultType? }`;新增 `pickResultType(o)` helper(鏡像 `pickTimes`:僅當 `o.result_type` 為非空字串時 `{ resultType }`,否則 `{}`);`parseUrlByContainer` 加 `...pickResultType(entry)`;`parseApplicationUrl` **不**加(application 無 result_type);`containers` 的 `byName` spread 已帶 `resultType`,無需改;更新檔頭註解
- [x] 13.5 (RED)新增 `ChangeTypeCell.test.tsx`(`@testing-library/react`):已知值(`'UPDATED'`)→ 渲染文字 `UPDATED`、`style.color` 為 `RESULT_TYPE_COLOR.UPDATED`(以 `toHaveStyle` 比對匯入常數,免硬編 hex)；未知值(`'MIGRATED'`)→ 渲染原字串、`style.color` 為 fallback;`undefined` / 空字串 → muted「—」;testId 透傳
- [x] 13.6 (GREEN)新增 `ChangeTypeCell`(`ChangeTypeCell.tsx` + `.types.ts` + `index.ts`,共置 `node-detail/components`,與 `ChangeTimeCell` 同層):props `{ type: string | undefined; testId?: string }`;有值 → `<span style={{ color: resultTypeColor(type) }}>`(CSS `textTransform: uppercase` / `whiteSpace: nowrap` / `fontWeight: 600`);無值 / 空字串 → muted「—」(`themeColors(theme).text.secondary`);`useStyles2` + emotion
- [x] 13.7 (RED)擴充 `ContainerTable.test.tsx`:header 期望更新為 **Name / Image / Change Type / Current Change Time / Previous Change Time / Code Changes**(6 欄);某列 `ready` 帶 `resultType` → 該列 `container-type` 顯示型別字串;`ready` 缺 `resultType` / `loading` / map 缺項列 → `container-type` 顯示「—」;既有 `first[0]`(name)/ `first[1]`(image)cell 斷言不受新欄影響
- [x] 13.8 (GREEN)`ContainerTable.tsx`:在 `image` 與 `current` 欄之間插入 `type` 欄(`id: 'type'`, `header: 'Change Type'`, `disableGrow`),cell 以 `rowLookup(lookups, name)` 取 `DetailLookup`、`lk.status==='ready' ? lk.resultType : undefined` 傳給 `<ChangeTypeCell type=… testId="container-type" />`;import `ChangeTypeCell`;`columns` memo deps 不變(lookups 已在);更新檔頭註解(欄序含 Change Type)。ApplicationTable **不**動(無此欄)
- [x] 13.9 (GREEN)確認 `ContainerTable` 右對齊 CSS:連結欄仍為 last-child(新增 `type` 欄在中段,不影響 `th:last-child` 規則);`type` 欄沿用 InteractiveTable 預設左對齊

## 14. result_type 品質閘 + 規格同步(重跑)

- [x] 14.1 `openspec validate change-report-diff-timestamps --strict` 通過(含新增 result_type / Change Type delta 與 scenario)
- [x] 14.2 `npm run typecheck` 通過(`exactOptionalPropertyTypes` 下 `resultType?` MUST NOT 被賦 `undefined`)
- [x] 14.3 `npm run lint`(zero-warning)通過
- [x] 14.4 `npm run test:ci` 全綠(含新 `colorByResultType` / `ChangeTypeCell` / `ContainerTable` result_type / hook 擴充測試)
- [x] 14.5 `npm run build` 成功並更新 `dist/`
- [~] 14.6 demo Playwright 驗證(2026-06-18,full-stack `/d/ksg-demo`,bundled chromium 驅動,右鍵掃描開 node-detail):**已驗** Containers 欄序為 `["Name","Image","Change Type","Current Change Time","Previous Change Time","Code Changes"]`(Change Type 落在 Image 與 Current 之間)、無 page error、NATS pod 兩 container 的 Change Type 皆降級為 muted「—」(backend `code_changes` 回 404、未回 `result_type`)。**待辦**:有 `result_type` 時的彩色型別正向呈現須待後端交付 `result_type` 後才驗證得了(無值降級「—」已驗)

## 11. 後端協調(跨 repo,blocked / 需 backend)

- [ ] 11.1 **[blocked / 需 backend]** kube-state-graph 後端:`config_changes`(application)回應由 `{ url }` 擴充為 `{ url, current_time, previous_time }`——`current_time` / `previous_time` 為 RFC 3339 / ISO 8601(UTC)字串(如 `2026-06-16T10:30:00Z`),向後相容(新增欄,缺漏即 best-effort 降級)
- [ ] 11.2 **[blocked / 需 backend]** kube-state-graph 後端:`code_changes`(image)每個 container entry 由 `{ url }` 擴充為 `{ url, current_time, previous_time, result_type }`(時間戳同 RFC 3339 UTC 契約;`result_type` 為變更型別字串,已知列舉 `UNCHANGED`/`UPDATED`/`REPLACED`/`ADDED`/`REMOVED`/`RENAMED`,向後相容)
- [ ] 11.3 **[blocked / 需 backend]** 後端交付後以 demo seeder / 真實後端回放時間戳,完成 10.5 時間欄正向呈現驗證

## 12. Archive 順序(MUST)

- [ ] 12.1 **先** archive `eager-change-report-prefetch`(`openspec archive eager-change-report-prefetch -y`)——把 eager delta(eager 預取 + 真實 anchor)套進 baseline `panel-rendering`;若不先做,本變更 delta 會疊在 lazy baseline 上產生不一致
- [ ] 12.2 **後** archive 本變更 `change-report-diff-timestamps`(`openspec archive change-report-diff-timestamps -y`),其 delta 以 eager 後的 baseline 為基準折入
