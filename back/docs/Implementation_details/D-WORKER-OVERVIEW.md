# D. Worker Overview（BE-040〜BE-046 + BE-080以降）

## このドキュメントの目的
Worker（抽出〜統合）周りの「どこがエントリーポイントで、どこから呼ばれる前提か」と「依存関係」を1枚にまとめる。

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
  - `Submission.artifactType` に応じて Adapter を分岐
    - PAPER: safe unzip（BE-042）→ latex extract（BE-043） or PDF extract（BE-044）
    - PR: PR adapter（diff/テスト信号）
    - DOC/SHEET: text adapter（構造化・信号付与）
  - `ExtractJson` を GCS に保存（BE-045）
    - `AnalysisPointers.gcsExtractJson` を更新
  - Claim Miner（LLM + fallback）
  - Claim Critic -> Refiner 反復
  - Preflight（BE-046）
  - Evidence / Logic / Prior-Art / Scoring
  - 結果を `analysis/.../result.json` に保存し `gcsAnalysisJson` 更新
  - Agent trace を段階保存（`summary.agents` のリアルタイム表示用）
4. ロック解放（BE-041）

## 依存関係（コンポーネント）
- `FirestoreRepo`（状態/ロック/ポインタ更新/agentTrace保存）
  - `Analysis.status/progress/step/error`（`src/domain/types.ts`）
  - `AnalysisPointers.gcsExtractJson` / `gcsAnalysisJson`（同上）
- `StorageService`（GCS）
  - raw 入力の取得（`Submission.gcsPathRaw`）
  - extract JSON / result JSON の保存
- `TasksService`（Cloud Tasks）
  - `/internal/tasks/analysis` に `{analysis_id}` を投げる（BE-032）
- `Extractor`
  - paper: BE-042 + BE-043 + BE-044
  - pr/doc/sheet: BE-080 adapter群
- `Claim Loop`
  - Critic/Refiner反復（BE-082）
- `Preflight`
  - ExtractJson を入力に findings を生成（BE-046）

## ID/命名の対応（重要）
- API body: `analysis_id`（snake_case）
- domain: `Analysis.analysisId`（camelCase）
- pointers: `AnalysisPointers.gcsExtractJson` / `gcsAnalysisJson` / `gcsReportHtml`
- agent trace: `Analysis.agentTrace[]` -> APIでは `summary.agents`
- refs: `ConversationRefs`（`paragraphIds`, `claimIds`, `figureIds`, `citationKeys`）
