## MODIFIED Requirements

### Requirement: 節點 detail 面板

header 除節點 name / kind / status 外,當該節點(**leaf / k8s-node / controller**;**cluster / namespace / storageclass 除外**)的 `/dashboard` 查詢回傳可用連結時,MUST 於 name 旁顯示 Dashboard 入口,且 `alerts` 與 `detail` **兩 view 皆顯示**。單一連結時為 **Dashboard** `LinkButton`;多個連結時為 **Dashboards** 下拉選單(各項帶 `label`)。行為細節見 `node-dashboard-url` capability。

#### Scenario: Dashboard 按鈕顯示於名稱旁(both views)

- **WHEN** 開啟某 leaf / k8s-node / controller 節點的 detail 面板,且其 `/dashboard` 查詢回傳 200 + 至少一筆非空連結
- **THEN** header 於節點名稱旁顯示 Dashboard 入口(單連結按鈕或多連結選單),`alerts`(左鍵)與 `detail`(右鍵)兩 view 皆然
- **AND** cluster / namespace / storageclass 節點不開啟面板,故不顯示此入口
