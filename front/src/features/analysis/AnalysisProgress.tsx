'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, ProgressBar, Badge } from '@/components/ui';
import { Clock, AlertCircle, CheckCircle } from 'lucide-react';
import type { AnalysisState } from '@/types';

interface AnalysisProgressProps {
  status: AnalysisState;
  progress?: number;
  message?: string;
  error?: string;
}

const statusConfig: Record<AnalysisState, { label: string; color: 'default' | 'warning' | 'success' | 'error' }> = {
  QUEUED: { label: 'キュー待ち', color: 'default' },
  UPLOADED: { label: 'アップロード完了', color: 'default' },
  EXTRACTING: { label: 'ファイル解析中', color: 'warning' },
  ANALYZING: { label: '分析実行中', color: 'warning' },
  READY: { label: '完了', color: 'success' },
  FAILED: { label: '失敗', color: 'error' },
};

export function AnalysisProgress({ status, progress, message, error }: AnalysisProgressProps) {
  const [estimatedTime, setEstimatedTime] = useState(120); // 2 minutes default

  useEffect(() => {
    if (status === 'ANALYZING' && estimatedTime > 0) {
      const timer = setInterval(() => {
        setEstimatedTime((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status, estimatedTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}分${secs}秒`;
  };

  return (
    <Card>
      <CardHeader
        title="解析状況"
        subtitle={message || '論文を分析しています...'}
        icon={status === 'FAILED' ? <AlertCircle className="w-5 h-5 text-red-600" /> : <Clock className="w-5 h-5 text-indigo-600" />}
        action={<Badge variant={statusConfig[status].color}>{statusConfig[status].label}</Badge>}
      />

      {status !== 'FAILED' && status !== 'READY' && (
        <div className="space-y-4">
          <ProgressBar progress={progress || 0} showLabel />
          
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>推定残り時間:</span>
            <span className="font-medium">{formatTime(estimatedTime)}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="flex gap-1">
              <StatusDot active={['UPLOADED', 'EXTRACTING', 'ANALYZING', 'READY', 'FAILED'].includes(status)} />
              <StatusDot active={['EXTRACTING', 'ANALYZING', 'READY', 'FAILED'].includes(status)} />
              <StatusDot active={['ANALYZING', 'READY', 'FAILED'].includes(status)} />
              <StatusDot active={['READY', 'FAILED'].includes(status)} />
            </div>
            <span>順調に進行中</span>
          </div>
        </div>
      )}

      {status === 'FAILED' && error && (
        <div className="p-4 bg-red-50 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-900 font-medium">解析に失敗しました</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
              <p className="text-red-600 text-sm mt-2">
                PDFファイルの場合は「ベータ機能」のため問題が発生する可能性があります。
                LaTeXプロジェクト（ZIP）でのご利用をお試しください。
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'READY' && (
        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <div>
            <p className="text-green-900 font-medium">解析が完了しました</p>
            <p className="text-green-700 text-sm">
              結果を確認して、論文の改善を進めましょう。
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <div
      className={`w-2 h-2 rounded-full ${
        active ? 'bg-indigo-600' : 'bg-gray-300'
      }`}
    />
  );
}
