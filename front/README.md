質問時刻: 2026年1月30日 18:37:39（JST）

# Reviewer Zero — フロントエンド

投稿前査読オーケストレーター「Reviewer Zero」のフロントエンド実装（Next.js + TypeScript）

> 元文書: フロントエンド要件定義・詳細設計書（SPA）

---

## クイックスタート

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build
```

## 環境変数

`.env.local` を作成してください：

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

詳細は [API_SPEC.md](./API_SPEC.md) を参照。

---

## 技術スタック

| 技術 | 用途 |
|------|------|
| Next.js 16 | Reactフレームワーク |
| TypeScript | 型安全 |
| Tailwind CSS | スタイリング |
| Zustand | クライアント状態管理 |
| TanStack Query | サーバーステート管理 |
| Axios | HTTPクライアント |

---

## Reviewer Zero — IEICE Letter Preflight & Oral Defense

---

## 0. 文書情報

* 文書名：フロントエンド要件定義・詳細設計書（SPA）
* 対象システム：Reviewer Zero（投稿前査読オーケストレーター）
* 版：v0.9（ドラフト）
* 想定利用：

  * ハッカソンMVPの開発（デモ成立・審査員に刺さるUX）
  * 将来的な学会提案の“見せられる”UI（硬派・信頼性を重視）

---

## 1. フロントエンドのゴール

### 1.1 体験上のゴール（UXの勝ち筋）

* 「校正ツール」ではなく **“査読官に詰められて論文が強固になる”**体験を前面にする
* 守り（形式チェック）は裏で動いても、UIの主役は **攻め（論理・根拠・口頭防衛）**
* Before/After（改善）が **視覚的に分かる**（ハッカソンデモで強い）

### 1.2 プロダクト上のゴール（学会に見せられる）

* UIが煽りすぎない（“鬼査読官”はモード名や演出に留め、トーンは節度）
* 根拠リンク（どの段落／図／引用が原因か）を提示し、**説明可能**にする
* 機密性の配慮が見える（保存ON/OFF、保持期間、外部送信の説明）

---

## 2. SPAの前提アーキテクチャ

### 2.1 推奨スタック（MVP向け）

* フレームワーク：React + TypeScript（SPA）
* ビルド：Vite
* ルーティング：React Router
* 通信：fetch or axios
* データフェッチ/キャッシュ：TanStack Query（推奨）
* 状態管理（軽量）：Zustand（推奨） or Redux Toolkit（重厚）
* UIコンポーネント：MUI / Chakra / Tailwind + Headless UI のいずれか
* Diff表示：Monaco Editor Diff / react-diff-viewer
* グラフ（Claim–Evidence Map）：D3 / Cytoscape.js（重ければテーブルにフォールバック）

> ハッカソン最優先なら「表（table）+ 簡易グラフ」から入るのが安全です。Graphは映えるけど沼りやすい。

### 2.2 SPAでのページ構造（基本）

* `/`：Landing（または即Uploadにリダイレクト）
* `/new`：新規セッション（アップロード）
* `/session/:sessionId`：セッションダッシュボード（解析・結果・対話）
* `/session/:sessionId/report/:reportId`：レポートビュー（閲覧・DL）
* `/settings`：設定（保存/保持/プライバシー）
* `/demo`：デモ用（ダミー論文ロード、台本ガイド）

---

## 3. フロント機能要件（Front Functional Requirements）

> 記法：FFR = Frontend Functional Requirement

### 3.1 セッション/識別

* **FFR-001**：ログイン無しで利用可能（匿名セッション）
* **FFR-002**：初回利用時に `client_session_token` を発行/保持（localStorage）
* **FFR-003**：複数セッション（論文プロジェクト）を扱える
* **FFR-004**：セッション一覧（最近使ったセッション）を表示できる（MVPは任意）

### 3.2 アップロード

* **FFR-010**：入力形式

  * LaTeX一式（推奨）：ZIPアップロード（`.zip`）
  * PDFアップロード（ベータ）
* **FFR-011**：ドラッグ&ドロップ対応
* **FFR-012**：アップロード前バリデーション

  * 拡張子、サイズ、ファイル数（ZIP推奨）
* **FFR-013**：アップロード設定

  * 言語（日本語/英語）
  * 分野タグ（任意：通信/信号/画像/NLP…）
  * 保存設定（保存しない/24h/7日 等）
* **FFR-014**：アップロード進捗表示（%・残り目安は不要でもOK）
* **FFR-015**：アップロード失敗時のリトライ導線（“再送”）

### 3.3 解析開始と進捗

* **FFR-020**：アップロード完了後に解析開始（`POST /analyze`）
* **FFR-021**：解析の進捗表示

  * MVP：ポーリング（`GET /analysis/{id}`）で状態を更新
  * 状態例：`UPLOADED`→`EXTRACTING`→`ANALYZING`→`READY` / `FAILED`
* **FFR-022**：解析失敗時

  * エラー原因（抽出失敗/形式不備/タイムアウト等）をユーザー向けに要約
  * “PDFはベータ”など注意喚起

### 3.4 結果表示（重要）

* **FFR-030**：結果サマリ（最初に見せる）

  * 致命傷Top3（Rejectリスク上位3点）
  * 改善指標（例：根拠なしClaim数、具体性欠如数）
* **FFR-031**：Evidence Auditor表示

  * Claim–Evidence Map（グラフ or テーブル）
  * クリックで本文該当箇所（抜粋）を表示
* **FFR-032**：Logic Sentinel表示

  * “具体性欠如ヒートマップ”（本文にハイライト）
  * フィルタ（断定表現/形容詞/比較欠落/数値欠落など）
* **FFR-033**：Preflight結果（守り）

  * 引用参照漏れ、図表参照漏れ、構造不足、分量注意
  * ただしUI上は“後ろのタブ”に置き、主役にしない

### 3.5 口頭防衛（Oral Defense：テキスト中心）

* **FFR-040**：チャットUIで質問→回答
* **FFR-041**：質問は「弱点から順」に提示（最大10問）
* **FFR-042**：回答後、AIが

  * “その説明だと通らない理由”
  * “論文に書ける追記案（2案）”
    を提示する
* **FFR-043**：追撃（フォローアップ）を最低1回実施できる
* **FFR-044**：（加点）デモ用に“1問だけ音声”モード

  * 失敗時は即テキストにフォールバック

### 3.6 Patch / ToDo

* **FFR-050**：修正ToDo Top10を表示（Impact×Effort）
* **FFR-051**：各ToDoに

  * 対象箇所（章/段落/図/引用）
  * 期待効果（査読コメント減の理由）
  * 修正文案（差分）
    を紐付け
* **FFR-052**：差分ビュー（diff）で提案を表示
* **FFR-053**：採用/却下（チェック）を記録できる（保存ONの場合）

### 3.7 レポート

* **FFR-060**：Pre-Review Reportの生成・閲覧
* **FFR-061**：PDF/HTMLダウンロード
* **FFR-062**：レポートURL共有（公開はしない。本人のみ閲覧想定）

### 3.8 設定（プライバシー重視）

* **FFR-070**：保存ON/OFF、保持期間
* **FFR-071**：外部送信に関する説明UI（「この処理でモデルに送るのは本文テキスト等」）
* **FFR-072**：全データ削除（セッション削除）ボタン（MVPは任意だが信頼感が増す）

---

## 4. 非機能要件（フロント）

### 4.1 パフォーマンス

* 初回表示：3秒以内（回線条件により劣化許容）
* 解析待ちのUI：ローディング・進捗で離脱を防ぐ
* 大容量表示（本文+ハイライト）：仮想スクロール（Virtualization）を検討

### 4.2 レスポンシブ

* MVP：デスクトップ優先（審査員デモ想定）
* モバイル：最低限閲覧できる（崩れない）程度

### 4.3 アクセシビリティ

* キーボード操作（Tab移動、Enter送信）
* コントラスト確保、ハイライトは色+アイコン/下線など冗長表現
* aria-label（ボタン、入力）

### 4.4 信頼性・説明可能性

* “指摘”には必ず根拠リンク（段落ID、引用キー、図番号）を表示
* 外部論文の存在断定はしない（MVPでは“クエリ提案＋差分表”）

---

## 5. 画面設計（SPAルート + UI要素）

### 5.1 画面一覧

1. **新規作成 / アップロード** `/new`
2. **解析中** `/session/:sessionId`（状態がREADYでなければ進捗UI）
3. **結果ダッシュボード** `/session/:sessionId`

   * タブ/サイドナビで以下に分割

     * Summary（致命傷Top3）
     * Evidence Map（Claim–Evidence）
     * Heatmap（具体性欠如）
     * Oral Defense（チャット/音声1問）
     * ToDo & Patch（差分）
     * Preflight（参照漏れ等）
     * Report（生成・閲覧）
4. **設定** `/settings`
5. **デモ** `/demo`

---

## 6. 詳細設計（コンポーネント・状態・データフロー）

### 6.1 コンポーネント構成（例）

* `AppShell`

  * `TopNav`
  * `SideNav`（セッション内タブ）
  * `Content`
* `UploadPage`

  * `UploadDropzone`
  * `UploadOptions`（言語/分野/保存）
  * `UploadProgress`
* `SessionPage`

  * `SessionHeader`（タイトル/状態/再解析）
  * `SessionTabs`
* Tabs

  * `SummaryTab`

    * `RiskTop3CardList`
    * `MetricsPanel`（Before/After）
  * `EvidenceMapTab`

    * `EvidenceMapGraph`（可能なら）
    * `EvidenceMapTable`（必須：フォールバック）
    * `ClaimDetailDrawer`（抜粋・根拠）
  * `HeatmapTab`

    * `TextHeatmapViewer`（仮想スクロール推奨）
    * `HeatmapFilterBar`
  * `OralDefenseTab`

    * `ChatThread`
    * `MessageComposer`
    * `VoiceOneShot`（任意）
  * `TodoPatchTab`

    * `TodoList`
    * `DiffViewer`
    * `AdoptRejectControls`
  * `PreflightTab`

    * `CheckList`
  * `ReportTab`

    * `ReportGenerateButton`
    * `ReportPreview`
    * `DownloadLinks`

### 6.2 状態管理の設計

#### 6.2.1 クライアント永続

* `client_session_token`：localStorage
* 設定（保存ON/OFF、保持期間、言語）：localStorage（MVP）

#### 6.2.2 グローバル状態（Zustand例）

* `currentSessionId`
* `userSettings`
* `uiState`（右ドロワー開閉、選択中Claim等）

#### 6.2.3 サーバーステート（TanStack Query）

* `useSession(sessionId)`
* `useAnalysis(analysisId)`（進捗ポーリング）
* `useOralAsk(sessionId)`（mutation）
* `usePatchGenerate(sessionId)`（mutation）
* `useReport(reportId)`（query）

---

## 7. APIインターフェース（フロント視点）

> 既存のバックエンド案を前提に、フロントが必要な最小契約を定義します。

### 7.1 Upload

* `POST /upload`

  * Request：`multipart/form-data`

    * `file`（zip/pdf）
    * `metadata`（json文字列）
  * Response（例）

```json
{
  "session_id": "sess_123",
  "submission_id": "sub_001",
  "upload_id": "upl_abc"
}
```

### 7.2 Analyze

* `POST /analyze`

  * Request

```json
{
  "session_id": "sess_123",
  "submission_id": "sub_001"
}
```

* Response

```json
{ "analysis_id": "ana_789" }
```

### 7.3 Poll Analysis

* `GET /analysis/{analysis_id}`

  * Response（例）

```json
{
  "status": "ANALYZING",
  "progress": 0.55,
  "message": "Extracting citations..."
}
```

READYになったら結果データを返す（もしくは別APIで取得）。

### 7.4 Oral Ask

* `POST /oral/ask`

  * Request

```json
{
  "session_id": "sess_123",
  "context": { "weak_points": ["claim_12", "fig_3"] },
  "user_answer": "計算量は同じだが定数倍が小さい"
}
```

* Response

```json
{
  "question": "O記法が同等なら、どの条件で高速化が有効ですか？",
  "follow_up": true,
  "draft_sentences": [
    "提案法の計算複雑性は従来法と同等であるが、実装上の定数倍を低減することで…",
    "計算量のオーダーは同等であるため、環境依存性がある点を制約として明記する。"
  ],
  "todo_suggestion": {
    "title": "Limitationsに追記",
    "impact": 4,
    "effort": 1
  }
}
```

### 7.5 Patch Generate

* `POST /patch/generate`

  * Request：`session_id, accepted_todos, target_format`
  * Response：`diff`（unified diff or structured）

### 7.6 Report

* `GET /report/{report_id}` もしくは `POST /report/generate`

---

## 8. 重要UIの詳細仕様（“ここが勝敗”）

### 8.1 Summary（最初に見せる画面）

* コンポーネント：`RiskTop3CardList`

  * 各カード：

    * タイトル（例：根拠なし主張が多い）
    * 根拠（該当Claim数、段落リンク）
    * “今すぐ直す”ボタン → ToDoタブ該当項目へスクロール
* 指標パネル：

  * `NoEvidenceClaims: 18 → 7` のように改善が見える形式

### 8.2 Claim–Evidence Map（グラフを無理しない設計）

* MVP推奨：**テーブル主体**

  * 列：Claim / Evidence（図・引用）/ 強度（Strong/Weak/None）/ 該当箇所
  * 行クリックで `ClaimDetailDrawer` を開く
* 加点（余力があれば）：簡易グラフ

  * Claimノード→Evidenceノードへの線
  * “None”は赤点（ただし色依存しない）

### 8.3 Heatmap（本文表示は落とし穴なので設計を固める）

* 本文は長いので、仮想スクロール（react-window等）推奨
* ハイライトは “種別タグ” を付ける

  * 例：`[数値なし] [比較なし] [条件なし]`
* フィルタで種別ごとにON/OFF

### 8.4 Oral Defense（チャット）

* メッセージタイプを分ける

  * AI質問（severity/根拠リンク付き）
  * ユーザー回答
  * AI評価（通る/通らない理由）
  * 追記ドラフト（採用ボタン付き）
* “採用”すると ToDo/Patch側に自動登録

### 8.5 ToDo & Patch（差分の採用体験）

* ToDoはTop10だけ表示（MVP）
* 各ToDoに “影響度（Impact）”と “工数（Effort）” を表示
* Diff表示

  * 左：Before / 右：After
  * もしくは unified diff
* “採用→再評価”導線を用意（再スコアで改善が見える）

---

## 9. エラーハンドリング設計

* 代表エラー

  * 413：ファイルサイズ超過 → 上限表示 + 圧縮/分割案
  * 422：形式解析失敗 → LaTeX推奨案 + サンプルZIP
  * 500/503：サーバ障害 → リトライ + ステータス表示
* UIルール

  * ユーザー責のエラー：入力近くに表示
  * サーバ責のエラー：トースト + 詳細（折りたたみ）

---

## 10. セキュリティ/プライバシーUI要件（学会提案で効く）

* アップロード画面に明示

  * 保存しない（セッション終了で削除）をデフォルト推奨
  * 保持期間を選べる
  * 解析に送られる情報（本文テキスト等）の説明（簡潔）
* 設定画面に

  * セッション削除
  * ローカルデータ削除（token/設定）

---

## 11. 実装フォルダ構成例（React + Vite）

```
src/
  app/
    App.tsx
    routes.tsx
    providers/
      QueryProvider.tsx
      StoreProvider.tsx
  pages/
    NewSessionPage/
    SessionPage/
    SettingsPage/
    DemoPage/
  features/
    upload/
    analysis/
    evidenceMap/
    heatmap/
    oralDefense/
    todoPatch/
    report/
  components/
    ui/
    layout/
  api/
    client.ts
    endpoints.ts
    types.ts
  store/
    useAppStore.ts
  utils/
    validators.ts
    formatters.ts
```

---

## 12. フロント受入基準（Front Acceptance Criteria）

* FA-01：ZIPアップロード→解析開始→進捗→結果表示まで通る
* FA-02：SummaryでTop3が表示され、該当箇所へジャンプできる
* FA-03：Claim–Evidenceが少なくともテーブルで見える（クリックで根拠が見える）
* FA-04：口頭試問（テキスト）が10問回せる（最低1回追撃）
* FA-05：ToDo Top10 + diff表示 + 採用/却下が動く
* FA-06：レポート生成→閲覧→DL導線がある
* FA-07：保存OFF/保持期間のUIがあり、説明が過不足ない

---

## 13. MVP開発の優先順位（フロント実装順）

1. UploadPage（ZIP/PDF + オプション + 進捗）
2. SessionPage（解析進捗ポーリング）
3. SummaryTab（Top3 + 指標）
4. EvidenceMapTab（テーブル + ドロワー）
5. OralDefenseTab（チャット）
6. TodoPatchTab（Top10 + diff）
7. ReportTab（生成 + DL）
8. HeatmapTab（余力があれば）
9. 音声1問（加点・失敗しても壊れない作り）

---

必要なら、この設計をそのまま実装に落とせるように次を続けて作れます（どれもSPA実装の“詰みポイント”を潰せます）：

* **APIのTypeScript型定義（`api/types.ts`）の完全版**
* **画面ワイヤー（簡易ASCII）＋ユーザーフロー図**
* **Claim–Evidenceテーブルの表示仕様（クリック時の抜粋表示のルール）**
* **チャットUIのメッセージスキーマ（質問/追撃/ドラフト/採用）**
