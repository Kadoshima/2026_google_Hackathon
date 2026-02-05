'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { reportApi } from '@/api';
import { Card, CardHeader, Button, Badge } from '@/components/ui';
import { Download, FileText, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ReportPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const reportId = params.reportId as string;

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => reportApi.get(reportId),
    enabled: !!reportId,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <p className="text-gray-500">レポートが見つかりません</p>
      </div>
    );
  }

  const handleDownload = async () => {
    try {
      const blob = await reportApi.download(reportId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${reportId}.${report.format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href={`/session/${sessionId}`}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          セッションに戻る
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Pre-Review Report
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="info">{report.format.toUpperCase()}</Badge>
            <span className="text-sm text-gray-500">
              生成日時: {new Date(report.created_at).toLocaleDateString('ja-JP')}
            </span>
          </div>
        </div>
        <Button onClick={handleDownload}>
          <Download className="w-4 h-4 mr-2" />
          ダウンロード
        </Button>
      </div>

      {/* Report Preview */}
      <Card>
        <CardHeader
          title="レポートプレビュー"
          subtitle="実際のレポート内容はダウンロードしてご確認ください"
        />
        
        <div className="space-y-6">
          {/* Executive Summary */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              エグゼクティブサマリ
            </h3>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-700">
                本論文は全体的に良質な研究内容を含んでいますが、
                エビデンスの提示と具体性の面で改善の余地があります。
                主要な懸念事項として、(1)実験結果の統計的検証の欠如、
                (2)性能主張の定量的裏付け不足、(3)先行研究との差別化の不明確さが挙げられます。
              </p>
            </div>
          </section>

          {/* Risk Summary */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              リスク評価
            </h3>
            <div className="space-y-3">
              <RiskRow
                category="Evidence"
                score={65}
                comment="主張と根拠の対応関係に改善の余地あり"
              />
              <RiskRow
                category="Logic"
                score={72}
                comment="具体性は良好だが一部曖昧な表現あり"
              />
              <RiskRow
                category="Preflight"
                score={88}
                comment="形式チェックは概ね良好"
              />
            </div>
          </section>

          {/* Recommendations */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              推奨アクション
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>図3の実験結果にp値とサンプルサイズを追加</li>
              <li>「高速化」の主張に具体的な数値（実行時間または倍率）を追加</li>
              <li>先行研究[4]との定量的な比較表を追加</li>
              <li>Limitationsセクションに適用範囲の制約を明記</li>
            </ol>
          </section>
        </div>
      </Card>
    </div>
  );
}

function RiskRow({ 
  category, 
  score, 
  comment 
}: { 
  category: string;
  score: number;
  comment: string;
}) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'text-green-600';
    if (s >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
      <div className="w-24 font-medium text-gray-700">{category}</div>
      <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
        {score}
      </div>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="text-sm text-gray-600">{comment}</div>
    </div>
  );
}
