# back / Reviewer Zero Backend

Reviewer Zero Backend は、成果物の理解を検証する **Accountability Engine** です。
実行責務は `Decompose -> Challenge -> Verify` のパイプライン運転です。

## 1) 役割

- Artifact入力の受理と正規化
- Claim/Evidence中心の構造分解
- 弱点検出（根拠不足・論理飛躍・整合崩れ）
- 口頭試問の質問/評価生成
- Patch/Reportの生成と保存
- Agent進行トレースの保存と配信

## 2) 対応Artifact

- `PAPER`（PDF / LaTeX ZIP）
- `PR`（text / diff）
- `DOC`（text / markdown）
- `SHEET`（json / plain）

拡張は Core Engine を変えず、Adapter追加で吸収する方針です。

## 3) API（主要）

- `POST /v1/upload`（paper向けファイルアップロード）
- `POST /v1/artifacts`（PR/DOC/SHEET向け入力）
- `GET /v1/capabilities`（受理可能入力/制約）
- `POST /v1/analyze`（解析ジョブ開始）
- `GET /v1/analysis/:analysisId`（進捗/結果）
- `GET /v1/sessions/:sessionId`（セッション情報）
- `POST /v1/oral/ask`（口頭試問）
- `POST /v1/patch/generate`（差分生成）
- `POST /v1/report/generate`（レポート生成）
- `GET /v1/report/:reportId`（レポート参照）
- `GET /v1/healthz`
- `POST /internal/tasks/analysis`（workerエントリ）

## 4) Agent Orchestration

標準シーケンス:

1. Planner
2. Extractor
3. Claim Miner（Critic -> Refiner 反復）
4. Preflight Guardian
5. Evidence Auditor
6. Logic Sentinel
7. Prior-Art Coach
8. Synthesizer

`analysis.agentTrace[]` に段階保存し、APIでは `summary.agents` として返却します。

## 5) Understanding Score（MVP方針）

Backend側では次の入力を将来スコア算出に使います。

- Claim-Evidence整合度
- Oral Defense応答の具体性
- 指摘後の修正反映率

現時点は土台データを保存し、スコア表示は段階導入します。

## 6) 技術スタック

- Node.js 20+
- TypeScript
- Hono
- Firestore
- Cloud Storage
- Cloud Tasks（本番）/ `in_process`（ローカル）
- Vertex AI

## 7) セットアップ

```bash
cd back
npm install
cp .env.example .env
```

最低限の必須設定:

- `PORT=8080`
- `GCP_PROJECT_ID=<project-id>`
- `BUCKET_NAME=<bucket-name>`
- `GOOGLE_APPLICATION_CREDENTIALS=<absolute-path-to-service-account-json>`
- `TASKS_DISPATCH_MODE=in_process`（ローカル）
- `VERTEX_MODEL=<利用可能モデル>`

## 8) 起動

```bash
npm run build
npm start
```

疎通確認:

```bash
curl http://localhost:8080/v1/healthz
```

## 9) 重要な環境変数

- `TASKS_DISPATCH_MODE` : `in_process | cloud_tasks`
- `VERTEX_MODEL`, `VERTEX_CLAIM_MODEL`, `VERTEX_FALLBACK_MODELS`
- `ANALYSIS_MAX_CLAIMS`, `ANALYSIS_LLM_MAX_SEGMENTS`
- `ANALYSIS_CLAIM_REFINER_MAX_ITER`
- `ANALYSIS_MIN_*`（artifact別しきい値）
- `ARTIFACT_MIN_CHARS`, `ARTIFACT_MAX_CHARS`

## 10) デバッグ観点

主要ログイベント:

- `analysis_pipeline_start`
- `analysis_extract_built`
- `llm_claim_extraction_request`
- `llm_claim_critic_iteration`
- `llm_claim_refiner_iteration`
- `analysis_result_saved`

## 11) よくある失敗

- `Vertex API ... model not found`
  - モデル名、リージョン、プロジェクト権限の不一致
- `failed to enqueue analysis`
  - Cloud Tasks設定不足（queue / target URL / service account）
- `DOC_AI_PROCESSOR_NAME is not configured`
  - `DOC_AI_ENABLED=1` 時に processor未設定

## 12) 関連

- `../README.md`
- `../front/README.md`
- `./docs/TODO.md`
- `./docs/Implementation_details/`
