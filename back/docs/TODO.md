# TODO（実装順・パスは .md 統一）

## A. プロジェクト基盤（まず動く骨格）

* [x] **BE-001：モノレポ/ディレクトリ構成の作成（frontend/backend分離）**
  `./Implementation_details/BE-001.md`

* [x] **BE-002：BackendのNode+TSプロジェクト初期化（package/tsconfig/lint/format）**
  `./Implementation_details/BE-002.md`

* [x] **FE-001：FrontendのSPA初期化（React+TS+Vite/Router/Query）**
  `./Implementation_details/FE-001.md`

* [ ] **DEV-001：ローカル開発の起動導線（pnpm scripts / env / README）**
  `./Implementation_details/DEV-001.md`

* [ ] **DEV-002：共通の型共有方針（api schema or shared package）決定＆最小実装**
  `./Implementation_details/DEV-002.md`

---

## B. GCP最小セットアップ（動かすための土台）

* [ ] **INF-001：GCPプロジェクト/サービスアカウント/権限（最低限）の準備**
  `./Implementation_details/INF-001.md`

* [ ] **INF-002：Cloud Storage バケット作成（raw/extract/analysis/reports/patches）**
  `./Implementation_details/INF-002.md`

* [ ] **INF-003：Firestore 初期セットアップ（コレクション方針・インデックス）**
  `./Implementation_details/INF-003.md`

* [ ] **INF-004：Cloud Run（API）デプロイ最小（Hello + healthz）**
  `./Implementation_details/INF-004.md`

* [ ] **INF-005：Cloud Tasks キュー作成（analysis用）＋OIDC設定**
  `./Implementation_details/INF-005.md`

---

## C. Backend API最小（アップロード→解析ジョブ→ポーリング）

* [ ] **BE-010：Fastifyサーバ雛形（routing/validation/logger/error）**
  `./Implementation_details/BE-010.md`

* [ ] **BE-011：データモデル定義（Session/Submission/Analysis）＋ID生成ユーティリティ**
  `./Implementation_details/BE-011.md`

* [ ] **BE-012：StorageService（GCS put/getSignedUrl/putJson）実装**
  `./Implementation_details/BE-012.md`

* [ ] **BE-013：FirestoreRepo（create/update/get）実装**
  `./Implementation_details/BE-013.md`

* [ ] **BE-014：POST /v1/upload（ZIP/PDF受理→GCS保存→Firestore記録）**
  `./Implementation_details/BE-014.md`

* [ ] **BE-015：POST /v1/analyze（analysis作成→Cloud Tasks投入）**
  `./Implementation_details/BE-015.md`

* [ ] **BE-016：GET /v1/analysis/:analysisId（進捗ポーリング）**
  `./Implementation_details/BE-016.md`

---

## D. Worker実装（抽出→中間JSON保存→最低限の結果作成）

* [ ] **BE-020：/internal/tasks/analysis（Cloud Tasksから起動されるWorker endpoint）**
  `./Implementation_details/BE-020.md`

* [ ] **BE-021：冪等性ロック（Firestoreトランザクションで二重実行防止）**
  `./Implementation_details/BE-021.md`

* [ ] **BE-022：LaTeX ZIPの安全展開（zip-slip対策/許可拡張子制限）**
  `./Implementation_details/BE-022.md`

* [ ] **BE-023：LatexExtractor（sections/paragraphs/figures/citations の最小抽出）**
  `./Implementation_details/BE-023.md`

* [ ] **BE-024：PdfExtractor（ベータ：テキスト抽出＋段落分割の最小）**
  `./Implementation_details/BE-024.md`

* [ ] **BE-025：ExtractJson仕様の確定＆GCS保存（extract/{analysisId}/extract.json）**
  `./Implementation_details/BE-025.md`

* [ ] **BE-026：Preflight最小（参照漏れ：図表/引用）検出**
  `./Implementation_details/BE-026.md`

---

## E. LLM接続（Vertex AI）＋解析パイプライン（必殺技まで）

* [ ] **BE-030：Vertex AIクライアント実装（モデル名env/タイムアウト/リトライ）**
  `./Implementation_details/BE-030.md`

* [ ] **BE-031：LLM出力JSONスキーマ（Zod/TypeBox）整備（必須）**
  `./Implementation_details/BE-031.md`

* [ ] **BE-032：Claim抽出（段落ID付き）プロンプト＋実装（Evidence Auditorの前段）**
  `./Implementation_details/BE-032.md`

* [ ] **BE-033：Evidence候補抽出（ルール：図表参照/引用キー/数値表現）**
  `./Implementation_details/BE-033.md`

* [ ] **BE-034：Claim–Evidence Link生成（LLM）＋support分類（STRONG/WEAK/NONE）**
  `./Implementation_details/BE-034.md`

* [ ] **BE-035：metrics算出（noEvidenceClaims / weakEvidenceClaims / specificityLack）**
  `./Implementation_details/BE-035.md`

* [ ] **BE-036：致命傷Top3（Rejectリスク上位3）生成（根拠refs必須）**
  `./Implementation_details/BE-036.md`

* [ ] **BE-037：Prior-Art Coach（検索クエリ案＋Related Work差分表テンプレ生成）**
  `./Implementation_details/BE-037.md`

* [ ] **BE-038：ToDo Top10（Impact×Effort）生成（最低限のランキング）**
  `./Implementation_details/BE-038.md`

* [ ] **BE-039：analysis/result.json 生成＆GCS保存（analysis/{analysisId}/result.json）**
  `./Implementation_details/BE-039.md`

* [ ] **BE-040：analysis READY時のレスポンス設計（署名URL返却）**
  `./Implementation_details/BE-040.md`

---

## F. Oral Defense（口頭試問API）＋Patch（diff）＋Report

* [ ] **BE-050：POST /v1/oral/ask（質問→評価→追記文案→todo候補）**
  `./Implementation_details/BE-050.md`

* [ ] **BE-051：会話ログ保存（保存ON時のみ）＋refs（paragraphIds/claimIds/figIds）**
  `./Implementation_details/BE-051.md`

* [ ] **BE-060：POST /v1/patch/generate（採用ToDo→unified diff生成→GCS保存）**
  `./Implementation_details/BE-060.md`

* [ ] **BE-070：POST /v1/report/generate（HTMLレポート生成→GCS保存）**
  `./Implementation_details/BE-070.md`

* [ ] **BE-071：GET /v1/report/:reportId（署名URL返却）**
  `./Implementation_details/BE-071.md`

---

## G. Frontend SPA（アップロード→解析→体験の核）

* [ ] **FE-010：SPAルーティング骨格（/new, /session/:id, /settings, /demo）**
  `./Implementation_details/FE-010.md`

* [ ] **FE-011：UploadPage（ZIP/PDF DnD + オプション + 進捗）**
  `./Implementation_details/FE-011.md`

* [ ] **FE-012：SessionPage（解析進捗ポーリング：READYまで）**
  `./Implementation_details/FE-012.md`

* [ ] **FE-020：SummaryTab（致命傷Top3 + metrics Before/After枠）**
  `./Implementation_details/FE-020.md`

* [ ] **FE-021：EvidenceMapTab（テーブル + ClaimDetailDrawer）**
  `./Implementation_details/FE-021.md`

* [ ] **FE-022：OralDefenseTab（チャットUI：質問→回答→ドラフト採用）**
  `./Implementation_details/FE-022.md`

* [ ] **FE-023：TodoPatchTab（Top10 + DiffViewer + 採用/却下）**
  `./Implementation_details/FE-023.md`

* [ ] **FE-024：ReportTab（生成→閲覧→DL）**
  `./Implementation_details/FE-024.md`

* [ ] **FE-030：PreflightTab（参照漏れ等：裏の守りを表示）**
  `./Implementation_details/FE-030.md`

* [ ] **FE-031：HeatmapTab（余力：本文ハイライト＋フィルタ）**
  `./Implementation_details/FE-031.md`

* [ ] **FE-040：設定画面（保存ON/OFF・保持期間・外部送信説明・削除）**
  `./Implementation_details/FE-040.md`

---

## H. デモ完成（ハッカソン用の勝ち筋を固める）

* [ ] **DEMO-001：ダメ論文（Before）サンプル用意（LaTeX ZIP）**
  `./Implementation_details/DEMO-001.md`

* [ ] **DEMO-002：デモ台本（1分）“致命傷→口頭防衛→diff→再スコア”**
  `./Implementation_details/DEMO-002.md`

* [ ] **DEMO-003：Reviewer #2 Mode（演出：質問の口調だけ切替）**
  `./Implementation_details/DEMO-003.md`

* [ ] **DEMO-004：音声1問（任意・失敗時フォールバック）**
  `./Implementation_details/DEMO-004.md`

---

## I. 運用・品質（落ちない・漏れない）

* [ ] **OPS-001：レート制限（429）＋サイズ制限（413）＋ガードレール**
  `./Implementation_details/OPS-001.md`

* [ ] **OPS-002：ログ設計（本文ログ禁止・requestId/analysisId/step）**
  `./Implementation_details/OPS-002.md`

* [ ] **OPS-003：cleanupジョブ（保持期限でGCS/Firestore削除）**
  `./Implementation_details/OPS-003.md`

* [ ] **QA-001：テスト最小セット（extract/LLM schema/api smoke）**
  `./Implementation_details/QA-001.md`

* [ ] **QA-002：E2Eスモーク（upload→analyze→READY→oral→patch→report）**
  `./Implementation_details/QA-002.md`
