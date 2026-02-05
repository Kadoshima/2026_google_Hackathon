# API仕様書（フロントエンド視点）

## 概要

Reviewer Zero フロントエンドは、以下のAPIエンドポイントと通信します。

- **Base URL**: `NEXT_PUBLIC_API_URL` 環境変数で設定（デフォルト: `http://localhost:8000/api/v1`）
- **認証**: `X-Client-Token` ヘッダーによる匿名認証
- **Content-Type**: `application/json`（ファイルアップロード時は `multipart/form-data`）

## 認証方式

### Anonymous Session Token

- 初回利用時に `client_session_token` を生成（localStorage保存）
- すべてのリクエストに `X-Client-Token` ヘッダーとして付与
- 401エラー時はトークンをクリアし再生成

```typescript
// リクエストヘッダー例
{
  'X-Client-Token': 'token_1234567890_abc123'
}
```

## エンドポイント一覧

### 1. Upload API

#### POST `/upload`
ファイルアップロード

**Request:**
```typescript
{
  file: File;           // ZIPまたはPDFファイル（最大50MB）
  metadata: {
    language: 'ja' | 'en';
    save_enabled: boolean;
    field?: string;
    title?: string;
    authors?: string[];
  }
}
```

**Response:**
```typescript
{
  session_id: string;    // "sess_xxx"
  submission_id: string; // "sub_xxx"
  upload_id: string;     // "upl_xxx"
}
```

---

### 2. Analysis API

#### POST `/analyze`
解析開始

**Request:**
```typescript
{
  session_id: string;
  submission_id: string;
  options?: {
    checks: ('evidence' | 'logic' | 'preflight')[];
    strictness: 'gentle' | 'standard' | 'strict';
  }
}
```

**Response:**
```typescript
{
  analysis_id: string;  // "ana_xxx"
}
```

#### GET `/analysis/{analysis_id}`
解析ステータス確認（ポーリング用）

**Response:**
```typescript
{
  analysis_id: string;
  status: 'UPLOADED' | 'EXTRACTING' | 'ANALYZING' | 'READY' | 'FAILED';
  progress?: number;     // 0-100
  message?: string;
  error?: string;
}
```

#### GET `/analysis/{analysis_id}/result`
解析結果取得

**Response:** `AnalysisResult`（types/api.ts参照）

---

### 3. Session API

#### GET `/sessions`
セッション一覧取得

**Response:**
```typescript
Session[]
```

#### GET `/sessions/{session_id}`
セッション詳細取得

**Response:** `Session`

#### POST `/sessions`
新規セッション作成

**Response:** `Session`

#### PUT `/sessions/{session_id}`
セッション更新

#### DELETE `/sessions/{session_id}`
セッション削除

#### DELETE `/sessions`
すべてのセッション削除

---

### 4. Oral Defense API

#### POST `/oral/start`
口頭試問セッション開始

**Request:**
```typescript
{
  session_id: string;
}
```

**Response:**
```typescript
{
  chat_id: string;
}
```

#### POST `/oral/ask`
質問/回答

**Request:**
```typescript
{
  session_id: string;
  context: {
    weak_points: string[];
    current_claim?: string;
  };
  user_answer: string;
}
```

**Response:**
```typescript
{
  question: string;
  follow_up: boolean;
  draft_sentences: string[];
  todo_suggestion?: {
    title: string;
    impact: number;
    effort: number;
  };
  severity?: 'critical' | 'warning' | 'info';
  linked_claim_id?: string;
}
```

#### GET `/oral/{chat_id}/history`
チャット履歴取得

**Response:**
```typescript
{
  messages: ChatMessage[]
}
```

---

### 5. Todo & Patch API

#### GET `/sessions/{session_id}/todos`
ToDo一覧取得

**Response:** `TodoItem[]`

#### PUT `/sessions/{session_id}/todos/{todo_id}`
ToDoステータス更新

**Request:**
```typescript
{
  status: 'pending' | 'accepted' | 'rejected' | 'done';
}
```

#### POST `/sessions/{session_id}/todos/{todo_id}/accept`
ToDo採用

#### POST `/sessions/{session_id}/todos/{todo_id}/reject`
ToDo却下

#### POST `/patch/generate`
パッチ生成

**Request:**
```typescript
{
  session_id: string;
  accepted_todos: string[];      // ToDo IDリスト
  target_format: 'latex' | 'docx' | 'markdown';
}
```

**Response:**
```typescript
{
  diff: string;                  // Unified diff形式
  patched_content?: string;      // 適用後の全文（オプション）
}
```

---

### 6. Report API

#### POST `/report/generate`
レポート生成

**Request:**
```typescript
{
  session_id: string;
  format: 'pdf' | 'html';
}
```

**Response:** `Report`

#### GET `/report/{report_id}`
レポート情報取得

**Response:** `Report`

#### GET `/report/{report_id}/download`
レポートダウンロード

**Response:** `Blob`（PDFまたはHTMLファイル）

---

### 7. Settings API

#### GET `/settings`
設定取得

**Response:** `UserSettings`

#### PUT `/settings`
設定更新

**Request:** `Partial<UserSettings>`

**Response:** `UserSettings`

## エラーレスポンス

```typescript
{
  error: {
    code: string;           // エラーコード
    message: string;        // エラーメッセージ
    details?: Record<string, unknown>;
  }
}
```

### 主要エラーコード

| コード | 説明 | 対応 |
|--------|------|------|
| `UNAUTHORIZED` | トークン無効 | トークン再生成 |
| `SESSION_NOT_FOUND` | セッション不存在 | ホームにリダイレクト |
| `ANALYSIS_FAILED` | 解析失敗 | エラー表示、再試行 |
| `FILE_TOO_LARGE` | ファイルサイズ超過 | 警告表示 |
| `INVALID_FORMAT` | ファイル形式不正 | 警告表示 |

## フロントエンドでの使い方

```typescript
import { uploadApi, analysisApi, sessionApi } from '@/api';

// ファイルアップロード
const result = await uploadApi.upload({
  file: selectedFile,
  metadata: { language: 'ja', save_enabled: true }
});

// 解析ステータスのポーリング
const { data: status } = useQuery({
  queryKey: ['analysis', analysisId],
  queryFn: () => analysisApi.getStatus(analysisId),
  refetchInterval: (query) => {
    const data = query.state.data;
    return data?.status === 'ANALYZING' ? 3000 : false;
  },
});
```
