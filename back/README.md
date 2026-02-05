# Backend 要件定義・詳細設計（TypeScript / Node.js, Cloud Run 想定）

対象：Reviewer Zero — IEICE Letter “Preflight & Oral Defense”

---

## 0. 文書情報

* 文書名：Backend 要件定義・詳細設計書
* 版：v0.9（ドラフト）
* 実装言語：TypeScript（Node.js）
* 実行基盤：Google Cloud（主に Cloud Run / Firestore / Cloud Storage / Vertex AI）
* 目的：

  * ハッカソンMVPとして「動く」「デモが刺さる」バックエンドを短期間で構築
  * 将来的に学会提案にも耐える、セキュリティ・説明可能性の土台を作る

---

# 1. Backendのゴールとスコープ

## 1.1 ゴール（Backendが提供すべき価値）

* **解析オーケストレーション**：アップロード → 抽出 → LLM解析 → 結果保存 → 口頭試問 → パッチ生成 → レポート生成 を安定して回す
* **説明可能性**：指摘の根拠（段落ID / 図表番号 / 引用キー）を返すための“構造化データ”を生成・保持
* **安全性**：未公開研究情報を扱う前提で、保存設定・保持期限・ログ最小化を実装
* **フロント（SPA）との契約**：ポーリングで進捗と結果が取れるAPI

## 1.2 スコープ（MVPでやる）

* 入力：LaTeX ZIP（推奨）/ PDF（ベータ）
* 解析：

  * セクション・図表・引用抽出
  * “致命傷Top3”生成
  * Claim–Evidence Map（主張と根拠の紐付け）生成
  * 具体性欠如（数値/条件/比較欠落など）の検出（“AI臭さ”は扱わない）
* 対話：口頭試問（テキスト）＋追撃（最低1回）
* 出力：ToDo Top10、差分（diff）案、レポート（HTML、PDFは任意）

## 1.3 スコープ外（MVPでやらない）

* 採択可否の断定（「採択/不採択」判定）
* 危険な自動スクレイピング（Google Scholar/IEEE Xplore等の規約リスクが高い収集）
* “AI生成判定”スコア化（炎上・誤判定・目的ズレ）
* 学会投稿システムへの直結（まずは著者向けツール）

---

# 2. 全体アーキテクチャ

## 2.1 コンポーネント構成

* **API / Orchestrator（Cloud Run）**

  * REST API提供
  * 分析ジョブ登録（キュー投入）・状態管理
  * LLM呼び出し（Vertex AI）と結果整形
* **Worker（Cloud Run 兼用 or 別サービス）**

  * Cloud Tasks から起動され、長い処理（抽出・解析）を実行
* **Data Store**

  * Firestore：状態・メタデータ・軽量結果
  * Cloud Storage：原稿・解析中間物・重いJSON（Claimリスト等）・レポート
* **LLM**

  * Vertex AI上のGemini系モデル利用（モデルは環境変数で切替）

> ハッカソンで安定させる最重要ポイントは「解析を同期レスポンスで完結させない」こと。Cloud Runのリクエストタイムアウトや偶発再起動で事故るので、**Cloud Tasksで非同期ジョブ化**し、フロントはポーリングで進捗表示します。

## 2.2 リクエストフロー（概要）

1. SPA → `POST /v1/upload`（ZIP/PDFを受け取りGCSへ）
2. SPA → `POST /v1/analyze`（analysis作成、Cloud Tasksに投入）
3. Worker → 解析（抽出→LLM→結果保存）
4. SPA → `GET /v1/analysis/:analysisId`（ポーリングで進捗/結果）
5. SPA → `POST /v1/oral/ask`（口頭試問ターン）
6. SPA → `POST /v1/patch/generate`（採用ToDoから差分生成）
7. SPA → `POST /v1/report/generate` → `GET /v1/report/:reportId`

---

# 3. 技術スタック（Node/TS）

## 3.1 実装方針

* Node.js 20+ / TypeScript
* Webフレームワーク：Fastify（高性能＋スキーマ駆動がやりやすい）
* 入力バリデーション：TypeBox or Zod（**必須**：LLM出力も検証）
* GCS：@google-cloud/storage
* Firestore：@google-cloud/firestore
* Cloud Tasks：@google-cloud/tasks
* Vertex AI：@google-cloud/vertexai（またはREST）
* ログ：pino（Fastify内蔵）＋構造化JSONログ
* OpenTelemetry（任意だが推奨）：trace idで追えるとデモでも強い

## 3.2 リポジトリ構成（例）

```
apps/
  api/
    src/
      index.ts
      server.ts
      routes/
        upload.ts
        analyze.ts
        analysis.ts
        oral.ts
        patch.ts
        report.ts
        sessions.ts
        health.ts
        internal.tasks.ts
      services/
        storage.service.ts
        firestore.repo.ts
        tasks.service.ts
        extract/
          latex.extractor.ts
          pdf.extractor.ts
          normalize.ts
        llm/
          vertex.client.ts
          prompts.ts
          jsonSchemas.ts
        analysis/
          orchestrator.ts
          logicSentinel.ts
          evidenceAuditor.ts
          priorArtCoach.ts
          scoring.ts
        oralDefense/
          oralExaminer.ts
        patch/
          patch.service.ts
          diff.ts
        report/
          report.service.ts
      domain/
        types.ts
        enums.ts
      utils/
        ids.ts
        errors.ts
        security.ts
        rateLimit.ts
    package.json
```

---

# 4. 機能要件（Backend）

## 4.1 セッション・プロジェクト管理

* **BR-001**：匿名セッション（client token）を受け付ける

  * ヘッダ例：`X-Client-Token: <uuid>`
* **BR-002**：セッション（論文プロジェクト）を作成/参照できる
* **BR-003**：保存OFFの場合は、一定時間後に自動削除される（保持期限）

## 4.2 アップロード

* **BR-010**：ZIP（LaTeX）またはPDFを受け付け、Cloud Storageに保存
* **BR-011**：アップロードメタデータ（言語、分野、保持期限、保存ON/OFF）をFirestoreに保存
* **BR-012**：ZIPの安全対策（パストラバーサル防止、許可拡張子制限）

## 4.3 解析ジョブ管理

* **BR-020**：`POST /analyze`でanalysisを作成し、Cloud TasksでWorkerを起動
* **BR-021**：解析状態（UPLOADED/EXTRACTING/ANALYZING/READY/FAILED）をFirestoreに保存
* **BR-022**：`GET /analysis/:id`で進捗と結果を返す（READY時は結果も返す）

## 4.4 抽出（LaTeX/PDF）

* **BR-030**：セクション構造、図表、引用（bibキー）を抽出
* **BR-031**：段落ID付与（根拠リンクのために必須）
* **BR-032**：抽出データを中間JSONとしてGCSに保存（追跡可能性）

## 4.5 解析（LLM）

* **BR-040**：致命傷Top3（Rejectリスク上位3）生成
* **BR-041**：Claim–Evidence Map生成（主張→根拠の紐付け）
* **BR-042**：具体性欠如ポイント抽出（数値/条件/比較/引用の欠落）
* **BR-043**：Related Work差分表テンプレと検索クエリ案生成（自動収集はしない）

## 4.6 口頭防衛（Oral Defense）

* **BR-050**：弱点に基づく質問生成（テキスト）
* **BR-051**：追撃質問（最低1回）
* **BR-052**：ユーザー回答から「論文に書ける追記文案（2案程度）」を生成
* **BR-053**：対話ログを保存（保存ONの場合）

## 4.7 Patch（差分）生成

* **BR-060**：採用ToDoから差分を生成（LaTeX優先）
* **BR-061**：差分形式：unified diff（推奨）＋構造化パッチ（任意）

## 4.8 レポート

* **BR-070**：レポート（HTML）生成しGCSに保存
* **BR-071**：PDFは拡張（サーバ側PDF生成をやるなら別Worker推奨）

---

# 5. 非機能要件（Backend）

## 5.1 性能・スケーラビリティ

* 解析ジョブ：Cloud Tasksで平準化（同時実行上限を制御）
* `GET /analysis/:id` は軽量（Firestore + 署名URL返却）
* Vertex AI呼び出しは並列数制限（p-limit等）

## 5.2 可用性・耐障害

* Workerは**冪等**（同じanalysisIdが来ても二重実行で壊れない）
* タスク失敗時：リトライ（Cloud Tasksの再試行）
* 状態遷移が破綻しない（FAILEDへ落ちる条件が明確）

## 5.3 セキュリティ・プライバシー

* 保存OFF（デフォルト推奨）／保持期限
* Cloud Tasks → Worker呼び出しはOIDCで認証（外部から叩けない）
* PII/機密をログに出さない（本文テキストをログ禁止）
* GCSは原則非公開、ダウンロードは署名URLで短時間のみ

## 5.4 ハルシネーション対策（設計要件）

* LLMの出力は必ずJSONスキーマ検証（失敗時は再プロンプト or FAILED）
* “断定”を避けるルールをプロンプトに強制し、根拠リンク（段落ID等）を必須化

---

# 6. データ設計（Firestore / GCS）

## 6.1 Firestore（推奨コレクション）

Firestoreは1ドキュメント1MB制限があるので、重い結果はGCSへ逃がす設計にします。

### `sessions/{sessionId}`

* sessionId, clientTokenHash
* createdAt, updatedAt
* retentionPolicy: { mode: "NO_SAVE"|"SAVE", ttlHours: number }
* language, domainTag

### `submissions/{submissionId}`

* sessionId
* inputType: "LATEX_ZIP"|"PDF"
* gcsPathRaw: `gs://.../raw/...`
* createdAt
* status: "UPLOADED"|"DELETED"

### `analyses/{analysisId}`

* sessionId, submissionId
* status: "QUEUED"|"EXTRACTING"|"ANALYZING"|"READY"|"FAILED"
* progress: 0..1
* step: "extract"|"logic"|"evidence"|"prior_art"|"finalize"
* error: { code, messagePublic, messageInternal? }
* pointers:

  * gcsExtractJson
  * gcsAnalysisJson
  * gcsReportHtml（生成後）
* metrics:

  * noEvidenceClaimsCount
  * weakEvidenceClaimsCount
  * specificityLackCount

### `analyses/{analysisId}/conversations/{turnId}`（保存ONのみ）

* role: "AI"|"USER"
* type: "QUESTION"|"ANSWER"|"EVAL"|"DRAFT"
* content（短め）
* refs: { paragraphIds, claimIds, figureIds, citationKeys }

## 6.2 Cloud Storage（推奨パス）

* `raw/{sessionId}/{submissionId}/...`
* `extract/{analysisId}/extract.json`
* `analysis/{analysisId}/result.json`（Claim/Evidence/ToDo等の重い本体）
* `reports/{analysisId}/report.html`
* `patches/{analysisId}/patch.diff`

---

# 7. API設計（REST / JSON）

フロント設計に合わせ、`/v1` で統一します。

## 7.1 共通

* 認証（MVP）：`X-Client-Token`
* 追加：`X-Request-Id`（クライアント側で付与可）
* CORS：SPAのオリジン許可

---

## 7.2 エンドポイント一覧（MVP）

### (1) Upload

**POST `/v1/upload`**（multipart）

* form:

  * `file`: zip/pdf
  * `metadata`: JSON文字列 `{ language, domainTag, retentionPolicy }`
* Response

```json
{
  "session_id": "sess_...",
  "submission_id": "sub_...",
  "upload_id": "upl_..."
}
```

### (2) Analyze（ジョブ作成）

**POST `/v1/analyze`**

* Request

```json
{ "session_id": "sess_...", "submission_id": "sub_..." }
```

* Response

```json
{ "analysis_id": "ana_..." }
```

### (3) Analysis Poll

**GET `/v1/analysis/:analysisId`**

* Response（READYなら `result` / それ以外は進捗のみ）

```json
{
  "analysis_id": "ana_...",
  "status": "ANALYZING",
  "progress": 0.55,
  "step": "evidence",
  "message": "Building claim-evidence map..."
}
```

READY時（例）

```json
{
  "analysis_id": "ana_...",
  "status": "READY",
  "progress": 1,
  "summary": {
    "top3_risks": [
      { "title": "根拠なし主張が多い", "refs": { "claim_ids": ["c12","c18"] } }
    ],
    "metrics": {
      "no_evidence_claims": 18,
      "specificity_lack": 30
    }
  },
  "pointers": {
    "analysis_json_signed_url": "https://...",
    "report_html_signed_url": "https://..."
  }
}
```

> READYのレスポンスは重くしない。詳細は署名URLで取る。

### (4) Oral Ask

**POST `/v1/oral/ask`**

* Request

```json
{
  "analysis_id": "ana_...",
  "turn_id": "t3",
  "user_answer": "O記法は同じで定数倍が小さい",
  "context": { "focus_claim_id": "c12" }
}
```

* Response

```json
{
  "question": "その高速化はどの条件で成立しますか？再現条件は？",
  "follow_up": true,
  "evaluation": {
    "pass": false,
    "reason": "論文に書ける条件・再現性の記述が不足"
  },
  "draft_sentences": [
    "提案法の計算複雑性は従来法と同等であるが、実装上の定数倍を低減することで…",
    "本評価は特定の実装・環境に依存する可能性があるため、制約として明記する。"
  ],
  "todo_candidate": { "title": "Limitations追記", "impact": 4, "effort": 1 }
}
```

### (5) Patch Generate

**POST `/v1/patch/generate`**

* Request

```json
{
  "analysis_id": "ana_...",
  "accepted_todos": ["todo_1", "todo_4"],
  "format": "UNIFIED_DIFF"
}
```

* Response

```json
{
  "diff_signed_url": "https://...",
  "patch_summary": { "files": 1, "hunks": 3 }
}
```

### (6) Report Generate（任意：READY後に押す）

**POST `/v1/report/generate`**

* Response

```json
{ "report_id": "rep_..." }
```

**GET `/v1/report/:reportId`**

* Response

```json
{ "report_html_signed_url": "https://..." }
```

### (7) Health

**GET `/v1/healthz`**

* Response：200 OK

---

# 8. 詳細設計（ドメイン/サービス設計）

## 8.1 ドメイン型（TypeScript）

* `Session`, `Submission`, `Analysis`, `Risk`, `Claim`, `Evidence`, `Todo`, `ConversationTurn`
* 重要：LLM出力は **Zod/TypeBox** で検証し、型安全にする

例（概略）

```ts
type Claim = {
  id: string;
  text: string;
  paragraphId: string;
  strength: "STRONG" | "WEAK";
};

type EvidenceRef =
  | { kind: "FIGURE"; figureId: string }
  | { kind: "CITATION"; citationKey: string }
  | { kind: "PARAGRAPH"; paragraphId: string };

type ClaimEvidenceLink = {
  claimId: string;
  evidence: EvidenceRef[];
  support: "STRONG" | "WEAK" | "NONE";
  reason?: string;
};
```

## 8.2 サービス分割

### StorageService（GCS）

* `putRawFile()`, `getSignedUrl()`, `putJson()`, `getJson()`

### FirestoreRepo

* `createSession()`, `createSubmission()`, `createAnalysis()`
* `updateAnalysisStatus()`, `saveConversationTurn()`
* `setPointers()`, `setMetrics()`

### TasksService（Cloud Tasks）

* `enqueueAnalysisTask(analysisId)`

### Extractor

* `LatexExtractor.extract(zipPath) -> ExtractJson`
* `PdfExtractor.extract(pdfPath) -> ExtractJson`

### LlmService（Vertex AI）

* `runPrompt<T>(prompt, schema) -> T`
* 再試行（JSONが壊れた時のre-prompt）を持つ

### AnalysisPipeline（Orchestrator）

* `run(analysisId)` が全体を順に実行し、ステータスとprogressを更新
* ステップ例：

  1. extract
  2. logicSentinel
  3. evidenceAuditor
  4. priorArtCoach
  5. finalize（top3, todos, pointers）

### OralExaminerService

* `nextQuestion(analysisId, context)`

### PatchService

* `generateUnifiedDiff(analysisId, acceptedTodos)`

### ReportService

* `renderHtml(analysisResult) -> html`
* `saveHtmlToGcs()`

---

# 9. 解析パイプラインの設計（重要：再現性と安定性）

## 9.1 ExtractJson（中間表現）仕様（MVP）

* `sections`: {id, title, level, startParagraphId, endParagraphId}
* `paragraphs`: {id, text, sectionId}
* `figures`: {id, caption, referencedParagraphIds}
* `citations`:

  * `bibEntries`: {key, raw}
  * `inTextCites`: {paragraphId, keys[]}

> “段落ID”を作っておくと、後段のLLMが「根拠箇所」を返しやすくなります。

## 9.2 LLMプロンプトの基本契約

* 出力は **JSONのみ**（余計な文章禁止）
* 各指摘に `paragraphId` / `claimId` / `figureId` / `citationKey` を必須化
* “断定しない”ガード：

  * 「外部論文の存在」などは断言禁止
  * 内部資料に存在するものだけを根拠として参照

## 9.3 Evidence Auditor（Claim–Evidence Map）生成手順

1. LLMでClaim候補抽出（段落ID付き）
2. ルールベースでEvidence候補抽出（図表参照・引用キー・数値表現）
3. LLMで “Claim→Evidenceリンク” を生成（JSON検証）
4. no/weak/strong を分類し、metricsを計算

> **完全にLLM任せにしない**（Evidence候補の抽出はルールで補強）方が安定します。

---

# 10. 内部Worker（Cloud Tasks）設計

## 10.1 Internal Endpoint

**POST `/internal/tasks/analysis`**

* Request

```json
{ "analysis_id": "ana_..." }
```

* 認証：Cloud Tasks OIDC（サービスアカウント）
* ガード：外部アクセス禁止（認証必須＋IP制限は任意）

## 10.2 冪等性

* `analyses/{analysisId}.status` が READY/FAILED の場合は即return（重複実行回避）
* EXTRACTING/ANALYZING なら “同一ジョブ実行中” を検出してreturn（ロック）

  * 方式：Firestoreトランザクションで `lockOwner` / `lockExpiresAt` を持つ

---

# 11. エラーハンドリング・ステータスコード規約

## 11.1 APIエラーの形

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "PDFの解析に失敗しました。LaTeX ZIPでの投稿を推奨します。",
    "details": { "hint": "..." }
  }
}
```

* PublicメッセージとInternalログを分離（機密混入防止）

## 11.2 代表例

* 400：入力不正（拡張子、必須パラメータなし）
* 413：サイズ超過
* 422：解析不能（LaTeXが壊れている等）
* 429：レート制限
* 500：内部エラー
* 503：依存サービス障害（Vertex AI等）

---

# 12. セキュリティ詳細

## 12.1 CORS / CSRF

* SPAオリジンのみ許可（CORS）
* Cookieセッションを使わない（MVPはトークンヘッダ）ならCSRFリスク低

## 12.2 アップロード安全対策

* ZIP展開時：

  * `../` を含むパス拒否（zip-slip対策）
  * 許可拡張子のみ通す（.tex .bib .png .jpg .pdf 等）
* MIMEタイプ検証（完全ではないが最低限）

## 12.3 データ保持

* retentionPolicyに従い、Cloud Scheduler + Cloud Run（cleanup）で削除
* “保存OFF”は短TTL（例：24h未満）

---

# 13. 観測性（ログ・メトリクス）

* ログに必ず入れる：

  * requestId / sessionId / analysisId / step / latency / modelName
* 禁止：

  * 論文本文全文、個人情報、引用全文（必要なら短い抜粋のみ）
* メトリクス例：

  * analysis_duration_seconds
  * vertex_calls_count / tokens_estimate
  * failures_by_step

---

# 14. テスト設計（最低限）

* Unit

  * ZIP安全展開
  * ExtractJson生成（LaTeX最小ケース）
  * JSONスキーマ検証（LLM出力）
* Integration

  * upload → analyze → poll READY の一連（Vertexはモック）
* E2E（デモ前）

  * ダミー論文（Before）投入で metrics が出ること（固定期待値）

---

# 15. デプロイ設計（Cloud Run）

* 環境変数

  * GCP_PROJECT_ID, REGION
  * BUCKET_NAME
  * FIRESTORE_DB
  * VERTEX_MODEL_NAME（例：`gemini-...`）
  * TASK_QUEUE_NAME, TASK_LOCATION
  * SIGNED_URL_TTL_SECONDS
* Secrets（Secret Manager推奨）

  * APIキー系が必要ならここ（通常GCP認証で足りる）
* Cloud Tasks

  * キューの最大並列、再試行回数、バックオフを設定

---

## 16. MVP実装の優先順位（Backend）

1. `/upload`（GCS保存＋Firestore）
2. `/analyze`（analysis作成＋Cloud Tasks投入）
3. Worker：extract（LaTeX）→ 簡易結果保存
4. LLM：Claim抽出 → Claim–Evidence Map（最小）→ metrics
5. `/analysis/:id`（ポーリング）
6. `/oral/ask`（質問生成→追記文案）
7. `/patch/generate`（diff生成）
8. `/report/generate`（HTML）

---

必要なら、次に「詳細設計の実装直結版」として

* **各APIのTypeBox/Zodスキーマ（そのままFastifyに貼れる）**
* **Vertex AI向けプロンプト（Claim抽出 / Evidenceリンク / Oral質問）をJSON出力固定で**
* **Firestoreのロック実装（冪等性・二重実行防止）**
  まで一気に書けます。
