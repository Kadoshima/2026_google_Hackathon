'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { sessionApi } from '@/api';
import { Card, CardHeader, Badge, ProgressBar, Button } from '@/components/ui';
import { 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  RefreshCw,
  MessageSquare,
  Lightbulb,
  Shield
} from 'lucide-react';
import Link from 'next/link';

export default function SessionPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  // Fetch session data
  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionApi.get(sessionId),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      // Poll while analyzing
      const data = query.state.data;
      if (data?.status === 'analyzing') {
        return 3000; // 3 seconds
      }
      return false;
    },
  });

  if (isLoading) {
    return <LoadingView />;
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">セッションが見つかりません</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Session Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {session.title || '無題の論文'}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={session.status} />
            {session.submission && (
              <span className="text-sm text-gray-500">
                {session.submission.filename}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            再解析
          </Button>
        </div>
      </div>

      {/* Analyzing State */}
      {session.status === 'analyzing' && (
        <AnalyzingView />
      )}

      {/* Results */}
      {session.status === 'completed' && (
        <ResultsView sessionId={sessionId} />
      )}

      {/* Error State */}
      {session.status === 'error' && (
        <ErrorView />
      )}

      {/* Feature Cards */}
      {session.status === 'active' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard
            icon={<Shield className="w-6 h-6" />}
            title="Evidence Map"
            description="主張と根拠の対応関係を確認"
            href={`/session/${sessionId}?tab=evidence`}
          />
          <FeatureCard
            icon={<AlertTriangle className="w-6 h-6" />}
            title="Logic Heatmap"
            description="具体性の欠如を可視化"
            href={`/session/${sessionId}?tab=heatmap`}
          />
          <FeatureCard
            icon={<MessageSquare className="w-6 h-6" />}
            title="Oral Defense"
            description="口頭試問シミュレーション"
            href={`/session/${sessionId}?tab=oral`}
          />
          <FeatureCard
            icon={<Lightbulb className="w-6 h-6" />}
            title="ToDo & Patch"
            description="修正候補の管理と適用"
            href={`/session/${sessionId}?tab=todo`}
          />
        </div>
      )}
    </div>
  );
}

function LoadingView() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  );
}

function AnalyzingView() {
  return (
    <Card className="text-center py-12">
      <div className="flex justify-center mb-6">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        解析中です...
      </h2>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        論文の構造を分析し、Evidence Audit、Logic Sentinel、Preflightチェックを実行しています。
        数分程度かかる場合があります。
      </p>
      <ProgressBar progress={45} showLabel />
      <div className="mt-6 flex justify-center gap-2 text-sm text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          推定残り時間: 約2分
        </span>
      </div>
    </Card>
  );
}

function ResultsView({ sessionId }: { sessionId: string }) {
  // TODO: Fetch actual results
  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader
          title="解析サマリ"
          subtitle="致命傷（Rejectリスク）トップ3"
        />
        <div className="space-y-3">
          <RiskItem
            rank={1}
            severity="critical"
            title="図3の実験結果に対する統計的検証が不十分"
            description="p値の提示なし、サンプルサイズの記載なし"
          />
          <RiskItem
            rank={2}
            severity="warning"
            title="主張「高速化」を裏付ける数値的根拠が不足"
            description="「大幅に高速化」→具体的な倍率または実行時間を記載"
          />
          <RiskItem
            rank={3}
            severity="warning"
            title="先行研究[4]との差別化が不明確"
            description="類似手法との定量的な比較が必要"
          />
        </div>
      </Card>

      {/* Metrics */}
      <div className="grid md:grid-cols-4 gap-4">
        <MetricCard
          label="エビデンス欠如"
          value="5"
          unit="箇所"
          trend="bad"
        />
        <MetricCard
          label="具体性欠如"
          value="12"
          unit="箇所"
          trend="warning"
        />
        <MetricCard
          label="参照漏れ"
          value="3"
          unit="箇所"
          trend="warning"
        />
        <MetricCard
          label="総合スコア"
          value="72"
          unit="/100"
          trend="good"
        />
      </div>
    </div>
  );
}

function ErrorView() {
  return (
    <Card className="border-red-200 bg-red-50">
      <div className="flex items-start gap-4">
        <AlertTriangle className="w-8 h-8 text-red-600" />
        <div>
          <h3 className="text-lg font-semibold text-red-900">
            解析に失敗しました
          </h3>
          <p className="text-red-700 mt-1">
            ファイルの形式が正しくないか、一時的なエラーが発生しました。
            PDFファイルの場合は「ベータ機能」のため問題が発生する可能性があります。
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="outline">もう一度試す</Button>
            <Button>サポートに連絡</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    active: { label: '進行中', variant: 'default' as const },
    analyzing: { label: '解析中', variant: 'warning' as const },
    completed: { label: '完了', variant: 'success' as const },
    error: { label: 'エラー', variant: 'error' as const },
  };

  const { label, variant } = config[status as keyof typeof config] || config.active;

  return <Badge variant={variant}>{label}</Badge>;
}

function RiskItem({ 
  rank, 
  severity, 
  title, 
  description 
}: { 
  rank: number;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
}) {
  const severityColors = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    info: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  return (
    <div className="flex gap-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-200 rounded-full font-bold text-gray-700">
        {rank}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium text-gray-900">{title}</h4>
          <span className={`px-2 py-0.5 text-xs rounded-full ${severityColors[severity]}`}>
            {severity === 'critical' ? '致命傷' : severity === 'warning' ? '警告' : '情報'}
          </span>
        </div>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </div>
  );
}

function MetricCard({ 
  label, 
  value, 
  unit, 
  trend 
}: { 
  label: string;
  value: string;
  unit: string;
  trend: 'good' | 'warning' | 'bad';
}) {
  const trendColors = {
    good: 'text-green-600',
    warning: 'text-yellow-600',
    bad: 'text-red-600',
  };

  return (
    <Card className="text-center">
      <p className="text-sm text-gray-600 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${trendColors[trend]}`}>
        {value}
        <span className="text-lg text-gray-500 ml-1">{unit}</span>
      </p>
    </Card>
  );
}

function FeatureCard({ 
  icon, 
  title, 
  description, 
  href 
}: { 
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full hover:border-indigo-300 transition-colors cursor-pointer">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-100 rounded-lg text-indigo-600">
            {icon}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600 mt-1">{description}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
