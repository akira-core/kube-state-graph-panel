# dev-environment delta — sync-netapp-storage-nodes

## ADDED Requirements

### Requirement: Demo seeder 推送 NetApp Harvest 與 kubelet 儲存序列

`dev/victoriametrics/seed.sh` MUST 於每個 tick 額外推送後端 NetApp 儲存鏈所需的序列,使 `docker compose --profile backend up` 的 `KSG Demo` 能實際產生 `netapp-aggr` / `netapp-node` / `storage-cluster` 節點、`pvc-to-netapp-aggr` 邊,以及 `health` / `usage` / 邊 I/O `metrics` 三類數值——否則 demo 的儲存半邊為空,前端的新渲染路徑無從肉眼驗證。

必要序列與其 label 契約(後端逐字比對,拼字不符即 join 落空):

- **Harvest volume 四家族** `volume_read_ops` / `volume_write_ops` / `volume_read_latency` / `volume_write_latency`,每條 MUST 帶 `cluster`(ONTAP cluster,**非** K8s cluster)、`node`(擁有該 aggregate 的 controller)、`aggr`、`svm`,以及 `volume_name`(**等於**該 PVC 之 `kube_persistentvolumeclaim_info.volumename` 值——此即整條鏈的 join key,兩處拼字必須一致)。
- **Harvest aggregate 三家族** `aggr_new_status`(`1` = online)/ `aggr_space_used` / `aggr_space_total`,帶 `cluster` / `node` / `aggr`,其 `(cluster, aggr)` MUST 對應到上述 volume 序列所報的 aggregate。
- **Harvest node 家族** `node_new_status`(`1` = healthy),帶 `cluster` / `node`。
- **kubelet volume stats** `kubelet_volume_stats_used_bytes` / `kubelet_volume_stats_capacity_bytes`,帶 `cluster` / `namespace` / `persistentvolumeclaim`,對應到 fixture 中既有的 PVC。

這些序列皆為 **gauge 語意**:後端以 `last_over_time` 讀取其視窗內最後一個樣本並**逐字採用**(ops 已是每秒值、latency 已是微秒平均),故 seeder MUST NOT 讓它們像 counter 一樣單調遞增——每 tick 重推**大致穩定**的值即可(可小幅擾動以顯示變化),遞增反而會使 demo 的 ops / latency 讀數失真。此與同檔案中 `traces_service_graph_*` counter **必須遞增**的規則相反,兩者不得混淆。

fixture MUST 同時涵蓋**有 join** 與**無 join** 兩種 PVC,使前端「無邊即無儲存鏈」與「缺 `usage` 即不畫使用率」的降級行為在 demo 中可被肉眼驗證:至少一個 PVC 的 `volumename` 不對應任何 volume 序列(或其序列 `aggr` 為空,即 FlexGroup 形狀),該 PVC MUST 不產生 `pvc-to-netapp-aggr` 邊。usage 亦 MUST 涵蓋高低兩檔(例如一個約 70%、一個約 20%),使節點使用率填充的差異在畫面上可辨。

`docker-compose.yaml` 的預設 `KSG_BACKEND_TAG` MUST 指向含後端 `replace-storageclass-with-netapp-nodes` 變更的 image;沿用舊 tag 時 demo 將完全不含儲存半邊(前端為硬切換,不再支援舊 `storageclass` 契約)。

#### Scenario: 每 tick 推送完整 NetApp 序列集

- **WHEN** `ksg-seeder` 容器完成一次 tick
- **THEN** 該次 push 的 payload 同時含四個 `volume_*` 家族、`aggr_new_status` / `aggr_space_used` / `aggr_space_total`、`node_new_status`,以及兩個 `kubelet_volume_stats_*` 家族

#### Scenario: volume_name 與 PVC 的 volumename 對齊

- **WHEN** 檢視 seeder 為某個 PVC(例如 `prod/db/data-mongo-0`)推送的 `kube_persistentvolumeclaim_info` 與 `volume_read_ops` 序列
- **THEN** 前者的 `volumename` label 與後者的 `volume_name` label 逐字相同,且後者另帶 `cluster` / `node` / `aggr` / `svm` 四個 label

#### Scenario: Harvest 序列為 gauge,不隨 tick 遞增

- **WHEN** 比較連續兩個 tick 中同一條 `volume_read_ops` 或 `aggr_space_used` 序列的值
- **THEN** 其值 MUST NOT 單調遞增為 counter 形狀,而是維持大致穩定(允許小幅擾動)——與同檔案 `traces_service_graph_*` counter 必須遞增的規則相反

#### Scenario: demo 同時呈現有 join 與無 join 的 PVC

- **WHEN** `KSG Demo` 以 `--profile backend` 啟動並載入圖
- **THEN** 至少一個 PVC 連往 `netapp-aggr`(帶邊上 I/O `metrics`),且至少一個 PVC 無任何 `pvc-to-netapp-aggr` 邊,使前端降級行為可被肉眼驗證

#### Scenario: usage 涵蓋高低兩檔

- **WHEN** 檢視 demo 中帶 `usage` 的節點(PVC 與 aggregate)
- **THEN** 其使用率至少涵蓋一高(約 70%)一低(約 20%)兩檔,使節點使用率填充的高度差異在畫面上可辨
