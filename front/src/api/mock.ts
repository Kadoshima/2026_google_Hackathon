// APIモック（バックエンド未実装時用）
// 実装後はこのファイルを削除してください

import type {
  Session,
  AnalysisStatus,
  AnalysisResult,
  TodoItem,
  ChatMessage,
  OralAskResponse,
} from '@/types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockApi = {
  // Upload
  upload: async (): Promise<{ session_id: string; submission_id: string; upload_id: string }> => {
    await delay(1000);
    return {
      session_id: `sess_${Date.now()}`,
      submission_id: `sub_${Date.now()}`,
      upload_id: `upl_${Date.now()}`,
    };
  },

  // Session
  getSession: async (sessionId: string): Promise<Session> => {
    await delay(500);
    return {
      session_id: sessionId,
      client_token: 'mock_token',
      title: 'デモ論文.tex',
      status: 'analyzing',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      submission: {
        submission_id: 'sub_001',
        upload_id: 'upl_001',
        filename: 'demo_paper.zip',
        file_type: 'zip',
      },
      settings: {
        save_enabled: true,
        retention_days: 30,
        language: 'ja',
      },
    };
  },

  // Analysis Status
  getAnalysisStatus: async (analysisId: string): Promise<AnalysisStatus> => {
    await delay(300);
    // デモ用: 30%の確率でREADY状態を返す
    const isReady = Math.random() > 0.7;
    return {
      analysis_id: analysisId,
      status: isReady ? 'READY' : 'ANALYZING',
      progress: isReady ? 100 : Math.floor(Math.random() * 80) + 10,
      message: isReady ? '解析完了' : '分析実行中...',
    };
  },

  // Analysis Result
  getAnalysisResult: async (): Promise<AnalysisResult> => {
    await delay(800);
    return {
      analysis_id: 'ana_001',
      session_id: 'sess_001',
      summary: {
        top_risks: [
          {
            id: 'risk_1',
            severity: 'critical',
            category: 'evidence',
            title: '図3の実験結果に統計的検証が不十分',
            description: 'p値の提示なし、サンプルサイズの記載なし',
          },
          {
            id: 'risk_2',
            severity: 'warning',
            category: 'logic',
            title: '「高速化」の主張に数値的根拠が不足',
            description: '「大幅に高速化」→具体的な倍率または実行時間を記載',
          },
        ],
        metrics: {
          claims_without_evidence: 5,
          vague_claims: 12,
          missing_references: 3,
          total_claims: 45,
        },
      },
      evidence_audit: {
        claims: [
          {
            claim_id: 'claim_1',
            claim_text: '提案手法は従来法より高速である',
            location: { page: 3, snippet: '提案手法は...' },
            evidence: [
              { type: 'experiment', ref_id: 'exp_1', snippet: '実行時間比較表' },
            ],
            strength: 'moderate',
          },
        ],
        overall_strength: 'moderate',
      },
      logic_sentinel: {
        vague_points: [
          {
            id: 'vague_1',
            type: 'no_number',
            text: '大幅に高速化',
            location: { page: 3, line: 12 },
            suggestion: '具体的な倍率（例：2倍、30%短縮）を記載',
          },
        ],
        overall_score: 72,
      },
      preflight: {
        citation_issues: [],
        figure_issues: [],
        structure_issues: [],
        length_check: {
          word_count: 4500,
          page_count: 6,
          warnings: [],
        },
      },
      created_at: new Date().toISOString(),
    };
  },

  // Todos
  getTodos: async (): Promise<TodoItem[]> => {
    await delay(400);
    return [
      {
        id: 'todo_1',
        title: '図3にp値を追加',
        description: '統計的有意性を示すp値を追加してください',
        impact: 5,
        effort: 2,
        status: 'pending',
        source: 'evidence',
        suggested_diff: '- \\caption{実験結果}\n+ \\caption{実験結果 ($p<0.01$)}',
      },
      {
        id: 'todo_2',
        title: '「高速化」の具体化',
        description: '「大幅に高速化」を具体的な数値に変更',
        impact: 4,
        effort: 1,
        status: 'pending',
        source: 'logic',
      },
    ];
  },

  // Oral Ask
  oralAsk: async (): Promise<OralAskResponse> => {
    await delay(1500);
    return {
      question: '「提案手法は従来法より高速である」と主張されていますが、具体的な計算量の比較や実測値の提示がありません。どのような条件で高速化が実現されるのでしょうか？',
      follow_up: true,
      draft_sentences: [
        '提案法の計算複雑性は従来法と同等であるが、実装上の定数倍を低減することで平均30%の高速化を実現した。',
        '計算量のオーダーは同等であるため、環境依存性がある点を制約として明記する。',
      ],
      todo_suggestion: {
        title: 'Limitationsに追記',
        impact: 4,
        effort: 1,
      },
      severity: 'warning',
    };
  },
};
