'use client';

import Link from 'next/link';
import type { UnderstandingScore, UnderstandingScoreLabel } from 'shared';
import { Card, CardHeader } from '@/components/ui';
import { Gauge, ShieldCheck, ScanSearch, Ruler, FileCheck2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  score: UnderstandingScore;
  oralDefenseHref?: string;
};

const LABEL_META: Record<
  UnderstandingScoreLabel,
  { text: string; ring: string; track: string; bg: string; hint: string }
> = {
  CRITICAL: {
    text: '致命的',
    ring: 'text-red-600',
    track: 'stroke-red-500',
    bg: 'bg-red-50 text-red-700 border-red-200',
    hint: 'このまま出荷すると危険。主張と根拠の断線が大きく、説明責任が果たせません。口頭試問で弱点を洗い出しましょう。'
  },
  WEAK: {
    text: '要改善',
    ring: 'text-orange-600',
    track: 'stroke-orange-500',
    bg: 'bg-orange-50 text-orange-700 border-orange-200',
    hint: '根拠や比較条件が弱いため、レビュアーに突っ込まれると説明が崩れます。Top3リスクから順に補強を。'
  },
  FAIR: {
    text: '及第点',
    ring: 'text-amber-600',
    track: 'stroke-amber-500',
    bg: 'bg-amber-50 text-amber-700 border-amber-200',
    hint: '通るかもしれませんが、少し突かれると説明できない論点が残っています。数値と比較条件で具体性を上げましょう。'
  },
  GOOD: {
    text: '良好',
    ring: 'text-emerald-600',
    track: 'stroke-emerald-500',
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    hint: '主張と根拠の対応は十分です。残る中位リスクを潰せば、安心して出荷できます。'
  },
  STRONG: {
    text: '強固',
    ring: 'text-green-600',
    track: 'stroke-green-500',
    bg: 'bg-green-50 text-green-700 border-green-200',
    hint: '説明責任はほぼ満たされています。出荷前の最終確認として口頭試問で締めてください。'
  }
};

const BREAKDOWN_META: Array<{
  key: 'evidence' | 'logic' | 'specificity' | 'preflight';
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'evidence',
    label: 'Evidence',
    description: '主張に根拠段落が紐づいているか',
    icon: <ShieldCheck className="w-4 h-4" aria-hidden="true" />
  },
  {
    key: 'logic',
    label: 'Logic',
    description: '因果・比較・条件の論理整合',
    icon: <ScanSearch className="w-4 h-4" aria-hidden="true" />
  },
  {
    key: 'specificity',
    label: 'Specificity',
    description: '数値・比較対象など具体性',
    icon: <Ruler className="w-4 h-4" aria-hidden="true" />
  },
  {
    key: 'preflight',
    label: 'Preflight',
    description: '図・参考文献の整合',
    icon: <FileCheck2 className="w-4 h-4" aria-hidden="true" />
  }
];

export function UnderstandingScoreCard({ score, oralDefenseHref }: Props) {
  const meta = LABEL_META[score.label];
  const circumference = 2 * Math.PI * 52;
  const dashOffset = circumference - (score.total / 100) * circumference;

  return (
    <Card>
      <CardHeader
        title="Understanding Score"
        subtitle="説明できる状態まで何%か"
        icon={<Gauge className="w-5 h-5 text-indigo-600" aria-hidden="true" />}
        action={
          <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full border', meta.bg)}>
            {meta.text}
          </span>
        }
      />
      <div className="grid md:grid-cols-[160px,1fr] gap-6 items-center">
        <div className="flex justify-center">
          <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
            <circle
              cx="70"
              cy="70"
              r="52"
              fill="transparent"
              stroke="currentColor"
              strokeWidth="12"
              className="text-gray-100"
            />
            <circle
              cx="70"
              cy="70"
              r="52"
              fill="transparent"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className={cn(meta.track, 'transition-all duration-700')}
            />
            <text
              x="70"
              y="70"
              textAnchor="middle"
              dominantBaseline="central"
              transform="rotate(90 70 70)"
              className={cn('text-3xl font-bold', meta.ring)}
              fill="currentColor"
            >
              {score.total}
            </text>
            <text
              x="70"
              y="92"
              textAnchor="middle"
              dominantBaseline="central"
              transform="rotate(90 70 70)"
              className="text-xs fill-gray-400"
            >
              / 100
            </text>
          </svg>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">{meta.hint}</p>
          <div className="grid grid-cols-2 gap-3">
            {BREAKDOWN_META.map((item) => {
              const value = score.breakdown[item.key];
              return (
                <div key={item.key}>
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                      {item.icon}
                      {item.label}
                    </span>
                    <span className="font-mono font-semibold text-gray-800">{value}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-700', barColor(value))}
                      style={{ width: `${value}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 leading-tight">{item.description}</p>
                </div>
              );
            })}
          </div>
          {oralDefenseHref && (
            <div className="flex justify-end">
              <Link
                href={oralDefenseHref}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                口頭試問でスコアを上げる
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function barColor(value: number): string {
  if (value >= 85) return 'bg-green-500';
  if (value >= 70) return 'bg-emerald-500';
  if (value >= 55) return 'bg-amber-500';
  if (value >= 35) return 'bg-orange-500';
  return 'bg-red-500';
}
