# Pilates Signup

手機優先的 Pilates 群組接龍報名頁。正式名額 12 人，候補 6 人。

## 已完成

- 12 個 Confirmed + 6 個 Waiting List
- 多人同時報名使用 PostgreSQL transaction advisory lock 排序，不會互相覆寫
- 同名（忽略大小寫與前後空白）不可重複報名
- 候補自動遞補：取消任一人後依建立時間重新排序
- 每位使用者只能用自己瀏覽器保存的 cancellation token 取消自己的報名
- Supabase Realtime 更新名單
- 手機分享名單與網址

## 1. 建立 Supabase 專案

1. 到 Supabase 建立一個 project。
2. 開啟 SQL Editor。
3. 將 `supabase.sql` 全部貼上並執行。
4. 到 Project Settings / API 取得：
   - Project URL
   - anon / publishable key

## 2. 設定前端

編輯 `config.js`：

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_ANON_OR_PUBLISHABLE_KEY"
};
```

Supabase 的 anon/publishable key 本來就是給瀏覽器使用；真正的安全邊界在 RLS 與 RPC 權限。請勿把 service_role key 放到前端。

## 3. 發布

這是純靜態網站，可部署到 GitHub Pages、Netlify 或 Vercel。

### GitHub Pages

若 repository / GitHub 方案允許 Pages：

1. Repository → Settings → Pages
2. Source 選 `Deploy from a branch`
3. Branch 選 `main` / `(root)`
4. Save

之後把 Pages URL 丟到 LINE 群即可。

## 資料一致性設計

使用者不直接寫入第 N 格，而是呼叫 `join_event()`。

`join_event()` 會：

1. 取得 PostgreSQL transaction-level advisory lock。
2. 檢查同名與總人數。
3. 寫入唯一一筆 registration。
4. 由資料庫依 `created_at, id` 決定順位。

因此即使兩個人同時搶最後一個正式名額，也只會有一人成為第 12 名，另一人會成為第 13 名候補，不會發生欄位覆寫。

## 注意

目前為單一固定活動。若後續要支援「每週不同日期 / 多堂課」，建議下一版增加 `events` table、活動管理頁與每個 event 的獨立報名連結。
