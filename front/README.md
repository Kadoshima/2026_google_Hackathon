# front / Reviewer Zero Frontend

Reviewer Zero Frontend は、Accountability Layer を体験として成立させるUIです。
目的は「解析結果を並べること」ではなく、**理解できていない点を発見して修正へつなげること**です。

## 1) 役割

- Artifactの入力（upload / text登録）
- 解析進行の可視化（Agentシーケンス）
- リスク要約の日本語表示
- Evidence / Oral Defense / ToDo-Patch / Report の操作導線
- 理解度指標（Understanding Score）の表示土台

## 2) 主要画面

### `/new`

- `PAPER / PR / DOC / SHEET` の入力切替
- Paper: ファイルアップロード
- PR/DOC/SHEET: テキスト登録

### `/session/:sessionId`

- Agentシーケンスバー（進行表示）
- サマリー（重大リスクTop3中心）
- 根拠マップ
- 口頭試問
- ToDo / Patch
- レポート
- 整合チェック
- ヒートマップ

## 3) 進捗表示ポリシー

`GET /v1/analysis/:analysisId` の `summary.agents` を使います。

- 詳細ログを縦に積まない
- いまどこまで進んだかを優先表示
- 完了率をシーケンスバーで一目表示

## 4) サマリー表示ポリシー

- UI文言は日本語中心
- 重大リスクTop3を主表示
- 補助情報は圧縮表示し、可読性を優先
- 指摘内容は「次に何を直すか」が分かる文面へ寄せる

## 5) 技術スタック

- Next.js 16
- React 19
- TypeScript
- TanStack Query
- Zustand
- Axios

## 6) セットアップ

```bash
cd front
npm install
cp .env.local.example .env.local
```

`.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8080/v1
```

## 7) 起動

```bash
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `NEXT_PUBLIC_API_URL` に接続

## 8) 開発コマンド

```bash
npm run dev
npm run lint
npm run build
./node_modules/.bin/tsc --noEmit --incremental false
```

## 9) トラブルシュート

- `ERR_CONNECTION_REFUSED`
  - backend未起動、またはURL不一致
- CORSエラー
  - backend側のCORS設定/ポート不一致
- `API Error` / `Failed to fetch`
  - backendログ（`analysis_pipeline_start`, `analysis_result_saved` など）を確認

## 10) 関連

- `../README.md`
- `../back/README.md`
