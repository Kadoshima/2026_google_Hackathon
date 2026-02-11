# TODO（実装順・パスは .md 統一）

## A. プロジェクト基盤（まず動く骨格）

* [x] **BE-001：モノレポ/ディレクトリ構成の作成（frontend/backend分離）**
  `./Implementation_details/BE-001.md`
  担当者: 

* [x] **BE-002：BackendのNode+TSプロジェクト初期化（package/tsconfig/lint/format）**
  `./Implementation_details/BE-002.md`
  担当者: 

* [x] **FE-001：FrontendのSPA初期化（React+TS+Vite/Router/Query）**
  `./Implementation_details/FE-001.md`
  担当者: 

* [x] **DEV-001：ローカル開発の起動導線（pnpm scripts / env / README）**
  `./Implementation_details/DEV-001.md`
  担当者: 

* [x] **DEV-002：共通の型共有方針（api schema or shared package）決定＆最小実装**
  `./Implementation_details/DEV-002.md`
  担当者: 萩原

---

## B. GCP最小セットアップ（動かすための土台）

* [X] **INF-001：GCPプロジェクト/サービスアカウント/権限（最低限）の準備**
  `./Implementation_details/INF-001.md`
  担当者: 萩原、小川

* [X] **INF-002：Cloud Storage バケット作成（raw/extract/analysis/reports/patches）**
  `./Implementation_details/INF-002.md`
  担当者:  萩原、小川

* [] **INF-003：Firestore 初期セットアップ（コレクション方針・インデックス）**
  `./Implementation_details/INF-003.md`
  担当者: 萩原

* [ ] **INF-004：Cloud Run（API）デプロイ最小（Hello + healthz）**
  `./Implementation_details/INF-004.md`
  担当者: 

* [ ] **INF-005：Cloud Tasks キュー作成（analysis用）＋OIDC設定**
  `./Implementation_details/INF-005.md`
  担当者: 

---

## C. Backend API最小（アップロード→解析ジョブ→ポーリング）

* [x] **BE-010：Honoサーバ雛形（entry/server/route登録）**
  `./Implementation_details/BE-010.md`
  担当者: 萩原

* [x] **BE-011：データモデル Enum 定義（InputType/Status/Retention/Step）**
  `./Implementation_details/BE-011.md`
  担当者: 萩原

* [x] **BE-012：Session 型の作成**
  `./Implementation_details/BE-012.md`
  担当者: 桐生

* [x] **BE-013：Submission 型の作成**
  `./Implementation_details/BE-013.md`
  担当者: 萩原

* [x] **BE-014：Analysis 型の作成**
  `./Implementation_details/BE-014.md`
  担当者: 桐生

* [x] **BE-015：ConversationTurn 型の作成**
  `./Implementation_details/BE-015.md`
  担当者: 萩原

* [x] **BE-016：ID生成ユーティリティ（sess/sub/ana/upl/rep 等）**
  `./Implementation_details/BE-016.md`
  担当者: 萩原

* [x] **BE-017：共通エラー型（errorレスポンス形）**
  `./Implementation_details/BE-017.md`
  担当者: 萩原

* [x] **BE-018：Firestore 初期化（client生成）**
  `./Implementation_details/BE-018.md`
  担当者: 萩原

* [x] **BE-019：FirestoreRepo.createSession**
  `./Implementation_details/BE-019.md`
  担当者: 萩原

* [x] **BE-020：FirestoreRepo.createSubmission**
  `./Implementation_details/BE-020.md`
  担当者: 萩原

* [x] **BE-021：FirestoreRepo.createAnalysis**
  `./Implementation_details/BE-021.md`
  担当者: 萩原

* [x] **BE-022：FirestoreRepo.updateAnalysisStatus**
  `./Implementation_details/BE-022.md`
  担当者: 萩原

* [x] **BE-023：FirestoreRepo.setPointers**
  `./Implementation_details/BE-023.md`
  担当者: 萩原

* [x] **BE-024：FirestoreRepo.setMetrics**
  `./Implementation_details/BE-024.md`
  担当者: 萩原

* [x] **BE-025：FirestoreRepo.saveConversationTurn**
  `./Implementation_details/BE-025.md`
  担当者: 萩原

* [x] **BE-026：FirestoreRepo.getAnalysis**
  `./Implementation_details/BE-026.md`
  担当者: 

* [x] **BE-027：GCS 初期化（client生成）**
  `./Implementation_details/BE-027.md`
  担当者: 萩原

* [x] **BE-028：StorageService.putRawFile**
  `./Implementation_details/BE-028.md`
  担当者: 萩原

* [x] **BE-029：StorageService.putJson**
  `./Implementation_details/BE-029.md`
  担当者: 萩原

* [x] **BE-030：StorageService.getSignedUrl**
  `./Implementation_details/BE-030.md`
  担当者: 萩原

* [x] **BE-031：Cloud Tasks 初期化（client生成）**
  `./Implementation_details/BE-031.md`
  担当者: 萩原

* [x] **BE-032：TasksService.enqueueAnalysisTask**
  `./Implementation_details/BE-032.md`
  担当者: 萩原

* [x] **BE-033：GET /v1/healthz**
  `./Implementation_details/BE-033.md`
  担当者: 萩原

* [x] **BE-034：POST /v1/upload（multipart受理＋metadata parse）**
  `./Implementation_details/BE-034.md`
  担当者: 萩原

* [x] **BE-035：POST /v1/upload（GCS保存→Firestore記録）**
  `./Implementation_details/BE-035.md`
  担当者: 萩原

* [x] **BE-036：POST /v1/analyze（analysis作成→Cloud Tasks投入）**
  `./Implementation_details/BE-036.md`
  担当者: 萩原

* [x] **BE-037：GET /v1/analysis/:analysisId（進捗ポーリング）**
  `./Implementation_details/BE-037.md`
  担当者: 萩原

---

## D. Worker実装（抽出→中間JSON保存→最低限の結果作成）

* [ ] **BE-040：POST /internal/tasks/analysis（Cloud Tasks起動）**
  `./Implementation_details/BE-040.md`
  担当者: 

* [ ] **BE-041：冪等性ロック（Firestoreトランザクションで二重実行防止）**
  `./Implementation_details/BE-041.md`
  担当者: 

* [ ] **BE-042：LaTeX ZIPの安全展開（zip-slip対策/許可拡張子制限）**
  `./Implementation_details/BE-042.md`
  担当者: 

* [ ] **BE-043：LatexExtractor（sections/paragraphs/figures/citations 最小抽出）**
  `./Implementation_details/BE-043.md`
  担当者: 

* [ ] **BE-044：PdfExtractor（ベータ：テキスト抽出＋段落分割）**
  `./Implementation_details/BE-044.md`
  担当者: 

* [ ] **BE-045：ExtractJson仕様の確定＆GCS保存（extract/{analysisId}/extract.json）**
  `./Implementation_details/BE-045.md`
  担当者: 

* [ ] **BE-046：Preflight最小（参照漏れ：図表/引用）検出**
  `./Implementation_details/BE-046.md`
  担当者: 

---

## E. LLM接続（Vertex AI）＋解析パイプライン（必殺技まで）

* [x] **BE-050：Vertex AIクライアント雛形（runPrompt/timeout/retry）**
  `./Implementation_details/BE-050.md`
  担当者: 萩原

* [x] **BE-051：プロンプト雛形（Claim/Evidence/Oral）**
  `./Implementation_details/BE-051.md`
  担当者: 萩原

* [x] **BE-052：LLM出力JSONスキーマ雛形（Zod/TypeBox）**
  `./Implementation_details/BE-052.md`
  担当者: 萩原

* [x] **BE-053：Analysis Orchestrator 雛形（extract→analysis→finalize）**
  `./Implementation_details/BE-053.md`
  担当者: 萩原

* [x] **BE-054：EvidenceAuditor 雛形（I/O定義）**
  `./Implementation_details/BE-054.md`
  担当者: 萩原

* [ ] **BE-055：LogicSentinel 雛形（I/O定義）**
  `./Implementation_details/BE-055.md`
  担当者: 

* [ ] **BE-056：PriorArtCoach 雛形（I/O定義）**
  `./Implementation_details/BE-056.md`
  担当者: 

* [ ] **BE-057：Scoring 雛形（metrics算出I/O）**
  `./Implementation_details/BE-057.md`
  担当者: 

---

## F. Oral Defense（口頭試問API）＋Patch（diff）＋Report

* [ ] **BE-070：OralExaminer 雛形（質問生成I/O）**
  `./Implementation_details/BE-070.md`
  担当者: 

* [ ] **BE-071：POST /v1/oral/ask（質問→評価→追記文案→todo候補）**
  `./Implementation_details/BE-071.md`
  担当者: 

* [ ] **BE-072：PatchService 雛形（generateUnifiedDiff I/O）**
  `./Implementation_details/BE-072.md`
  担当者: 

* [ ] **BE-073：POST /v1/patch/generate（採用ToDo→diff生成→GCS保存）**
  `./Implementation_details/BE-073.md`
  担当者: 

* [ ] **BE-074：ReportService 雛形（renderHtml I/O）**
  `./Implementation_details/BE-074.md`
  担当者: 

* [ ] **BE-075：POST /v1/report/generate（HTML生成→GCS保存）**
  `./Implementation_details/BE-075.md`
  担当者: 

* [ ] **BE-076：GET /v1/report/:reportId（署名URL返却）**
  `./Implementation_details/BE-076.md`
  担当者: 

---

## G. Frontend SPA（アップロード→解析→体験の核）

* [ ] **FE-010：SPAルーティング骨格（/new, /session/:id, /settings, /demo）**
  `./Implementation_details/FE-010.md`
  担当者: 

* [ ] **FE-011：UploadPage（ZIP/PDF DnD + オプション + 進捗）**
  `./Implementation_details/FE-011.md`
  担当者: 

* [ ] **FE-012：SessionPage（解析進捗ポーリング：READYまで）**
  `./Implementation_details/FE-012.md`
  担当者: 

* [ ] **FE-020：SummaryTab（致命傷Top3 + metrics Before/After枠）**
  `./Implementation_details/FE-020.md`
  担当者: 

* [ ] **FE-021：EvidenceMapTab（テーブル + ClaimDetailDrawer）**
  `./Implementation_details/FE-021.md`
  担当者: 

* [ ] **FE-022：OralDefenseTab（チャットUI：質問→回答→ドラフト採用）**
  `./Implementation_details/FE-022.md`
  担当者: 

* [ ] **FE-023：TodoPatchTab（Top10 + DiffViewer + 採用/却下）**
  `./Implementation_details/FE-023.md`
  担当者: 

* [ ] **FE-024：ReportTab（生成→閲覧→DL）**
  `./Implementation_details/FE-024.md`
  担当者: 

* [ ] **FE-030：PreflightTab（参照漏れ等：裏の守りを表示）**
  `./Implementation_details/FE-030.md`
  担当者: 

* [ ] **FE-031：HeatmapTab（余力：本文ハイライト＋フィルタ）**
  `./Implementation_details/FE-031.md`
  担当者: 

* [ ] **FE-040：設定画面（保存ON/OFF・保持期間・外部送信説明・削除）**
  `./Implementation_details/FE-040.md`
  担当者: 

---

## H. デモ完成（ハッカソン用の勝ち筋を固める）

* [ ] **DEMO-001：ダメ論文（Before）サンプル用意（LaTeX ZIP）**
  `./Implementation_details/DEMO-001.md`
  担当者: 

* [ ] **DEMO-002：デモ台本（1分）“致命傷→口頭防衛→diff→再スコア”**
  `./Implementation_details/DEMO-002.md`
  担当者: 

* [ ] **DEMO-003：Reviewer #2 Mode（演出：質問の口調だけ切替）**
  `./Implementation_details/DEMO-003.md`
  担当者: 

* [ ] **DEMO-004：音声1問（任意・失敗時フォールバック）**
  `./Implementation_details/DEMO-004.md`
  担当者: 

---

## I. 運用・品質（落ちない・漏れない）

* [ ] **OPS-001：レート制限（429）＋サイズ制限（413）＋ガードレール**
  `./Implementation_details/OPS-001.md`
  担当者: 

* [ ] **OPS-002：ログ設計（本文ログ禁止・requestId/analysisId/step）**
  `./Implementation_details/OPS-002.md`
  担当者: 

* [ ] **OPS-003：cleanupジョブ（保持期限でGCS/Firestore削除）**
  `./Implementation_details/OPS-003.md`
  担当者: 

* [ ] **QA-001：テスト最小セット（extract/LLM schema/api smoke）**
  `./Implementation_details/QA-001.md`
  担当者: 

* [ ] **QA-002：E2Eスモーク（upload→analyze→READY→oral→patch→report）**
  `./Implementation_details/QA-002.md`
  担当者: 
