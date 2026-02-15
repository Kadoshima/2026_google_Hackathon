'use client';

import { useState } from 'react';
import { Card, CardHeader, Button, ProgressBar } from '@/components/ui';
import { Play, MessageSquare } from 'lucide-react';

const demoSteps = [
  {
    title: '論文のアップロード',
    description: 'LaTeXプロジェクトまたはPDFファイルをアップロードします。',
    action: 'アップロードをシミュレート',
  },
  {
    title: '自動解析',
    description: 'Evidence Auditor、Logic Sentinel、Preflightの3つのエンジンが並行して解析を実行します。',
    action: '解析結果を見る',
  },
  {
    title: 'サマリ確認',
    description: '致命傷（Rejectリスク）トップ3と改善指標が表示されます。',
    action: '詳細を見る',
  },
  {
    title: 'Oral Defense',
    description: '査読官からの質問をシミュレートし、論理の穴を発見します。',
    action: '試問を開始',
  },
];

export default function DemoPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const startDemo = () => {
    setIsRunning(true);
    // Auto-advance steps
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setCurrentStep(step);
      if (step >= demoSteps.length - 1) {
        clearInterval(interval);
        setIsRunning(false);
      }
    }, 2000);
  };

  const resetDemo = () => {
    setCurrentStep(0);
    setIsRunning(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Reviewer Zero デモ
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          実際の論文を使って、Reviewer Zeroの機能を体験できます。
          ダミーデータを使用して、フローを確認しましょう。
        </p>
      </div>

      {/* Demo Progress */}
      <Card className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">デモ進行状況</h2>
          <div className="flex gap-2">
            {!isRunning && currentStep === 0 && (
              <Button onClick={startDemo}>
                <Play className="w-4 h-4 mr-2" />
                デモを開始
              </Button>
            )}
            {currentStep > 0 && !isRunning && (
              <Button variant="outline" onClick={resetDemo}>
                リセット
              </Button>
            )}
          </div>
        </div>

        <ProgressBar 
          progress={(currentStep / (demoSteps.length - 1)) * 100} 
          showLabel
        />

        <div className="mt-6 grid gap-4">
          {demoSteps.map((step, index) => (
            <DemoStep
              key={index}
              step={step}
              index={index}
              isActive={index === currentStep}
              isCompleted={index < currentStep}
            />
          ))}
        </div>
      </Card>

      {/* Demo Content */}
      {currentStep >= 1 && (
        <Card className="mb-8">
          <CardHeader
            title="解析サマリ（デモ）"
            subtitle="実際の解析結果はこのような形式で表示されます"
          />
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                  致命傷 #1
                </span>
                <span className="font-medium text-red-900">
                  図3の実験結果に対する統計的検証が不十分
                </span>
              </div>
              <p className="text-sm text-red-700">
                p値の提示なし、サンプルサイズの記載なし。査読官は実験の信頼性を疑う可能性があります。
              </p>
            </div>

            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                  警告 #1
                </span>
                <span className="font-medium text-yellow-900">
                  主張「高速化」を裏付ける数値的根拠が不足
                </span>
              </div>
              <p className="text-sm text-yellow-700">
                「大幅に高速化」という表現がありますが、具体的な倍率または実行時間の比較がありません。
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-6">
              <MetricBox label="エビデンス欠如" value="5箇所" color="red" />
              <MetricBox label="具体性欠如" value="12箇所" color="yellow" />
              <MetricBox label="総合スコア" value="72/100" color="green" />
            </div>
          </div>
        </Card>
      )}

      {currentStep >= 3 && (
        <Card>
          <CardHeader
            title="Oral Defense（デモ）"
            subtitle="査読官からの質問シミュレーション"
          />
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="flex-1 p-4 bg-gray-100 rounded-lg">
                <p className="text-gray-900">
                  「提案手法は従来法より高速である」と主張されていますが、
                  具体的な計算量の比較や実測値の提示がありません。
                  どのような条件で高速化が実現されるのでしょうか？
                </p>
              </div>
            </div>

            <div className="flex gap-4 justify-end">
              <div className="flex-1 max-w-xl p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p className="text-sm text-indigo-800 mb-2">回答例：</p>
                <p className="text-gray-900">
                  計算量は同じですが、定数倍の改善により高速化を実現しています。
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-medium">You</span>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-900">
                  追撃：O記法が同等なら、どの条件で定数倍の改善が有効ですか？
                  また、メモリ使用量や並列化可能性への影響はありませんか？
                </p>
              </div>
            </div>

            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-900 mb-2">
                提案される追記案：
              </p>
              <p className="text-gray-800">
                「提案法の計算複雑性は従来法と同等（O(n²)）であるが、
                実装上の定数倍を低減することで平均30%の高速化を実現した。
                ただし、データサイズが10⁶を超える場合はメモリ制約により従来法を推奨する。」
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline">
                  ToDoに追加
                </Button>
                <Button size="sm">
                  パッチを適用
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function DemoStep({ 
  step, 
  index, 
  isActive, 
  isCompleted 
}: { 
  step: typeof demoSteps[0];
  index: number;
  isActive: boolean;
  isCompleted: boolean;
}) {
  return (
    <div
      className={`
        flex items-start gap-4 p-4 rounded-lg transition-colors
        ${isActive ? 'bg-indigo-50 border border-indigo-200' : ''}
        ${isCompleted ? 'opacity-60' : ''}
      `}
    >
      <div
        className={`
          w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
          ${isCompleted ? 'bg-green-500 text-white' : ''}
          ${isActive ? 'bg-indigo-600 text-white' : ''}
          ${!isActive && !isCompleted ? 'bg-gray-200 text-gray-600' : ''}
        `}
      >
        {isCompleted ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          index + 1
        )}
      </div>
      <div className="flex-1">
        <h3 className="font-medium text-gray-900">{step.title}</h3>
        <p className="text-sm text-gray-600 mt-1">{step.description}</p>
      </div>
    </div>
  );
}

function MetricBox({ 
  label, 
  value, 
  color 
}: { 
  label: string;
  value: string;
  color: 'red' | 'yellow' | 'green';
}) {
  const colors = {
    red: 'bg-red-50 text-red-900',
    yellow: 'bg-yellow-50 text-yellow-900',
    green: 'bg-green-50 text-green-900',
  };

  return (
    <div className={`p-4 rounded-lg text-center ${colors[color]}`}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
