# dev-environment delta — edge-red-metrics

## ADDED Requirements

### Requirement: Demo seeder 推送 RED 來源序列

`dev/victoriametrics/seed.sh` MUST 於每個 tick 除既有的 `traces_service_graph_request_total` 之外,額外推送兩組 RED 來源序列,使 `docker compose --profile backend up` 的 `KSG Demo` 能實際產生 `data.metrics`:

- `traces_service_graph_request_failed_total` —— 失敗計數器。
- `traces_service_graph_request_server_seconds_bucket` —— server 端耗時的 **classic histogram**(累積式 bucket,含 `le` label)。

後端以**完整 label set 的精確比對**(除 `__name__`;histogram 另除 `le`)把三組序列 join 到同一條邊,因此:

- 兩組新序列的 label set MUST 與其對應的 `traces_service_graph_request_total` 序列**逐字完全一致**(histogram 僅可多出 `le`)。任何多出、少掉或拼字不同的 label 都會使 join 落空,`error_rate` 與 `p90_server_ms` 靜默消失。
- 三組序列 MUST 與既有 total 一樣**每 tick 遞增**(至少兩個樣本落在查詢視窗內),否則 `rate()` 為 0,後端不產生量測值。
- 失敗計數 MUST 嚴格小於對應的 total 計數且大於 0,使 `error_rate` 落在開區間 `(0,1)`,demo 才看得出非零錯誤率。
- histogram MUST 至少提供兩個 `le` 邊界並**必定包含 `le="+Inf"`**,且值為累積(單調不減),否則後端無法計算 p90 而省略 `p90_server_ms`。

seeder MUST NOT 為任一序列加上 `edge_relation="link"` label(後端對 RED 來源序列排除該值,加上會使該邊失去量測)。

fixture MUST 同時涵蓋**有 RED** 與**無 RED** 兩種邊,使前端的「省略即不顯示」行為在 demo 中可被肉眼驗證:指向 `external` 節點的那條邊(`api.payments.io`)依後端契約永不帶 `metrics`,故其存在即滿足此要求,無須額外新增序列。

#### Scenario: 每 tick 三組序列一併推送

- **WHEN** `ksg-seeder` 容器完成一次 tick
- **THEN** 該次 push 的 payload 同時含 `traces_service_graph_request_total`、`traces_service_graph_request_failed_total` 與 `traces_service_graph_request_server_seconds_bucket` 三種 metric,且三者的計數值皆較上一 tick 增加

#### Scenario: 新序列的 label set 與 total 完全對齊

- **WHEN** 檢視 seeder 為某一條邊(例如 `prod/gateway → dr/consumer`)推送的三組序列
- **THEN** `_failed_total` 的 label set 與該邊的 `_total` 逐字相同;`_server_seconds_bucket` 的 label set 亦相同,僅多一個 `le`

#### Scenario: histogram 具備可計算 p90 的形狀

- **WHEN** 檢視某條邊的 `_server_seconds_bucket` 序列
- **THEN** 其含有至少兩個 `le` 邊界並包含 `le="+Inf"`,且 bucket 值沿 `le` 遞增方向單調不減

#### Scenario: demo 同時呈現有 RED 與無 RED 的邊

- **WHEN** 開發者以 `docker compose --profile backend up` 啟動全端 demo 並在 `KSG Demo` 上 hover 各條邊
- **THEN** `pod-calls-service`(gateway → mongo-svc、consumer → nats-svc)與跨叢集 `pod-calls-pod`(prod/gateway → dr/consumer)顯示 RED rows
- **AND** 指向 `external` 節點 `api.payments.io` 的邊不顯示任何 RED row
