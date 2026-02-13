# D. Worker Overview（BE-040〜BE-046）

## このドキュメントの目的
Worker（抽出〜preflight）周りの「どこがエントリーポイントで、どこから呼ばれる前提か」と「依存関係」を1枚にまとめる。

## エントリーポイント（コード）
- プロセス起動: `src/index.ts`
  - `serve({ fetch: createApp().fetch, port })`
- ルーティング登録: `src/server.ts`
  - `/v1/*` と `/internal/*` を登録
- Internal routes: `src/routes/internal/index.ts`
  - `/internal` 配下に task routes を登録
- Worker endpoint（Cloud Tasks の target）: `src/routes/internal/tasks.ts`
  - `POST /internal/tasks/analysis`（= `/internal` + `/tasks/analysis`）

## エントリーポイント（外部からの呼ばれ方）
### SPA → API（同期）
1. `POST /v1/upload`（BE-034/BE-035）
  - raw（ZIP/PDF）を GCS へ保存
  - Firestore に `Session` と `Submission` を作成
2. `POST /v1/analyze`（BE-036）
  - Firestore に `Analysis` を作成（`analysisId` 採番）
  - Cloud Tasks に enqueue（BE-032）
3. `GET /v1/analysis/:analysisId`（BE-037）
  - Firestore から `Analysis` を読み、`status/progress/pointers` を返す

### Cloud Tasks → Worker（非同期）
- `POST /internal/tasks/analysis`（BE-040）
  - body: `{ "analysis_id": "ana_..." }`（snake_case）
  - OIDC サービスアカウントで認証（BE-032 の前提）

## Worker の呼び出しチェーン（論理）
1. `POST /internal/tasks/analysis`
2. 冪等ロック取得（BE-041）
  - 既に `READY/FAILED` の場合はスキップ
  - 実行中ロックの場合もスキップ（stale なら奪取）
3. Orchestrator 実行（BE-040 内から呼ぶ想定）
  - 入力 `Analysis` / `Submission` を Firestore から取得
  - `Submission.inputType` に応じて extractor を分岐
    - LaTeX ZIP: safe unzip（BE-042）→ latex extract（BE-043）
    - PDF: pdf extract（BE-044）
  - `ExtractJson` を GCS に保存（BE-045）
    - `AnalysisPointers.gcsExtractJson` を更新
  - Preflight（BE-046）
  - 最低限結果を `analysis/.../result.json` に保存（将来 `AnalysisPointers.gcsAnalysisJson` 更新）
4. ロック解放（BE-041）

## 依存関係（コンポーネント）
- `FirestoreRepo`（状態/ロック/ポインタ更新）
  - `Analysis.status/progress/step/error`（`src/domain/types.ts`）
  - `AnalysisPointers.gcsExtractJson`（同上）
- `StorageService`（GCS）
  - raw 入力の取得（`Submission.gcsPathRaw`）
  - extract JSON / result JSON の保存
- `TasksService`（Cloud Tasks）
  - `/internal/tasks/analysis` に `{analysis_id}` を投げる（BE-032）
- `Extractor`
  - latex: BE-042 + BE-043
  - pdf: BE-044
- `Preflight`
  - ExtractJson を入力に findings を生成（BE-046）

## ID/命名の対応（重要）
- API body: `analysis_id`（snake_case）
- domain: `Analysis.analysisId`（camelCase）
- pointers: `AnalysisPointers.gcsExtractJson` / `gcsAnalysisJson` / `gcsReportHtml`
- refs: `ConversationRefs`（`paragraphIds`, `claimIds`, `figureIds`, `citationKeys`）

