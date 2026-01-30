'use client';

import { useState } from 'react';
import { Card, CardHeader, Badge } from '@/components/ui';
import type { VaguePoint } from '@/types';
import { AlertCircle, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TextHeatmapViewerProps {
  text: string;
  vaguePoints: VaguePoint[];
}

type FilterType = 'all' | 'no_number' | 'no_comparison' | 'no_condition' | 'adjective_only';

const filterConfig: Record<FilterType, { label: string; color: string }> = {
  all: { label: 'すべて', color: 'bg-gray-100' },
  no_number: { label: '数値なし', color: 'bg-red-100 text-red-800' },
  no_comparison: { label: '比較なし', color: 'bg-orange-100 text-orange-800' },
  no_condition: { label: '条件なし', color: 'bg-yellow-100 text-yellow-800' },
  adjective_only: { label: '形容詞のみ', color: 'bg-purple-100 text-purple-800' },
};

export function TextHeatmapViewer({ text, vaguePoints }: TextHeatmapViewerProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const filteredPoints = activeFilter === 'all'
    ? vaguePoints
    : vaguePoints.filter((p) => p.type === activeFilter);

  // Split text into segments based on vague points
  const renderHighlightedText = () => {
    if (!text) return null;

    // For demo purposes, we'll simulate highlighting
    // In real implementation, this would use actual positions
    return (
      <div className="space-y-4 text-sm leading-relaxed text-gray-700">
        {text.split('\n').map((paragraph, pIndex) => (
          <p key={pIndex}>
            {paragraph.split(' ').map((word, wIndex) => {
              // Simulate matching vague points
              const matchedPoint = filteredPoints.find((point) =>
                point.text.includes(word.slice(0, 10))
              );

              if (matchedPoint) {
                return (
                  <span
                    key={wIndex}
                    className={cn(
                      'cursor-pointer hover:opacity-80 transition-opacity',
                      getHighlightColor(matchedPoint.type)
                    )}
                    title={matchedPoint.suggestion}
                  >
                    {word}{' '}
                  </span>
                );
              }

              return <span key={wIndex}>{word} </span>;
            })}
          </p>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader
        title="Logic Heatmap"
        subtitle="具体性の欠如箇所をハイライト表示"
        icon={<AlertCircle className="w-5 h-5 text-orange-600" />}
      />

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 mr-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-600">フィルタ:</span>
        </div>
        {(Object.keys(filterConfig) as FilterType[]).map((type) => (
          <button
            key={type}
            onClick={() => setActiveFilter(type)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
              activeFilter === type
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {filterConfig[type].label}
            {type !== 'all' && (
              <span className="ml-1 text-gray-500">
                ({vaguePoints.filter((p) => p.type === type).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        {Object.entries(filterConfig)
          .filter(([key]) => key !== 'all')
          .map(([key, config]) => (
            <div key={key} className="flex items-center gap-1">
              <span className={cn('w-3 h-3 rounded', config.color)} />
              <span className="text-gray-600">{config.label}</span>
            </div>
          ))}
      </div>

      {/* Text Content */}
      <div className="p-4 bg-gray-50 rounded-lg max-h-[500px] overflow-y-auto">
        {text ? (
          renderHighlightedText()
        ) : (
          <p className="text-gray-400 text-center py-8">
            テキストデータがありません
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="mt-4 flex gap-4 text-sm">
        <div>
          <span className="text-gray-500">検出数:</span>
          <span className="ml-1 font-medium">{filteredPoints.length}箇所</span>
        </div>
        <div>
          <span className="text-gray-500">種別:</span>
          <span className="ml-1">
            {activeFilter === 'all'
              ? 'すべて'
              : filterConfig[activeFilter].label}
          </span>
        </div>
      </div>
    </Card>
  );
}

function getHighlightColor(type: VaguePoint['type']): string {
  switch (type) {
    case 'no_number':
      return 'bg-red-200 border-b-2 border-red-500';
    case 'no_comparison':
      return 'bg-orange-200 border-b-2 border-orange-500';
    case 'no_condition':
      return 'bg-yellow-200 border-b-2 border-yellow-500';
    case 'adjective_only':
      return 'bg-purple-200 border-b-2 border-purple-500';
    default:
      return 'bg-gray-200';
  }
}
