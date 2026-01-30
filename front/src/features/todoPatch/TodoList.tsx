'use client';

import { useState } from 'react';
import { Card, CardHeader, Button, Badge } from '@/components/ui';
import type { TodoItem } from '@/types';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Edit3, 
  ChevronDown, 
  ChevronRight,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TodoListProps {
  todos: TodoItem[];
  onAccept: (todoId: string) => void;
  onReject: (todoId: string) => void;
  onGeneratePatch: () => void;
}

export function TodoList({ todos, onAccept, onReject, onGeneratePatch }: TodoListProps) {
  const [expandedTodos, setExpandedTodos] = useState<Set<string>>(new Set());
  const [showDiff, setShowDiff] = useState<string | null>(null);

  const toggleExpand = (todoId: string) => {
    const newExpanded = new Set(expandedTodos);
    if (newExpanded.has(todoId)) {
      newExpanded.delete(todoId);
    } else {
      newExpanded.add(todoId);
    }
    setExpandedTodos(newExpanded);
  };

  const acceptedCount = todos.filter((t) => t.status === 'accepted').length;
  const pendingCount = todos.filter((t) => t.status === 'pending').length;

  return (
    <Card>
      <CardHeader
        title="ToDo & Patch"
        subtitle={`${acceptedCount}件採用 / ${pendingCount}件未対応`}
        action={
          <Button size="sm" onClick={onGeneratePatch}>
            <Download className="w-4 h-4 mr-2" />
            パッチ生成
          </Button>
        }
      />

      <div className="space-y-3">
        {todos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>ToDoがありません</p>
          </div>
        ) : (
          todos.map((todo) => (
            <TodoItemCard
              key={todo.id}
              todo={todo}
              isExpanded={expandedTodos.has(todo.id)}
              showDiff={showDiff === todo.id}
              onToggle={() => toggleExpand(todo.id)}
              onAccept={() => onAccept(todo.id)}
              onReject={() => onReject(todo.id)}
              onToggleDiff={() => setShowDiff(showDiff === todo.id ? null : todo.id)}
            />
          ))
        )}
      </div>
    </Card>
  );
}

interface TodoItemCardProps {
  todo: TodoItem;
  isExpanded: boolean;
  showDiff: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onReject: () => void;
  onToggleDiff: () => void;
}

function TodoItemCard({
  todo,
  isExpanded,
  showDiff,
  onToggle,
  onAccept,
  onReject,
  onToggleDiff,
}: TodoItemCardProps) {
  return (
    <div
      className={cn(
        'border rounded-lg transition-colors',
        todo.status === 'accepted' && 'border-green-200 bg-green-50',
        todo.status === 'rejected' && 'border-gray-200 bg-gray-50 opacity-60',
        todo.status === 'pending' && 'border-gray-200 bg-white',
        todo.status === 'done' && 'border-blue-200 bg-blue-50'
      )}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={onToggle}
      >
        <button className="p-1 hover:bg-gray-100 rounded">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </button>

        <StatusIcon status={todo.status} />

        <div className="flex-1 min-w-0">
          <p className={cn(
            'font-medium text-sm truncate',
            todo.status === 'rejected' && 'line-through'
          )}>
            {todo.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <SourceBadge source={todo.source} />
            <ImpactIndicator impact={todo.impact} effort={todo.effort} />
          </div>
        </div>

        {todo.status === 'pending' && (
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
              className="p-2 hover:bg-red-100 rounded-full text-gray-400 hover:text-red-600"
              title="却下"
            >
              <XCircle className="w-5 h-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAccept();
              }}
              className="p-2 hover:bg-green-100 rounded-full text-gray-400 hover:text-green-600"
              title="採用"
            >
              <CheckCircle className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {todo.description && (
            <p className="text-sm text-gray-600 mt-3">{todo.description}</p>
          )}

          {todo.suggested_diff && (
            <div className="mt-3">
              <button
                onClick={onToggleDiff}
                className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <Edit3 className="w-4 h-4" />
                {showDiff ? '差分を隠す' : '差分を表示'}
              </button>

              {showDiff && (
                <div className="mt-2 p-3 bg-gray-900 rounded-lg overflow-x-auto">
                  <pre className="text-sm text-gray-100 font-mono whitespace-pre">
                    {todo.suggested_diff}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: TodoItem['status'] }) {
  switch (status) {
    case 'accepted':
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    case 'rejected':
      return <XCircle className="w-5 h-5 text-gray-400" />;
    case 'done':
      return <CheckCircle className="w-5 h-5 text-blue-600" />;
    default:
      return <Clock className="w-5 h-5 text-yellow-500" />;
  }
}

function SourceBadge({ source }: { source: TodoItem['source'] }) {
  const config = {
    evidence: { label: 'Evidence', color: 'bg-purple-100 text-purple-800' },
    logic: { label: 'Logic', color: 'bg-orange-100 text-orange-800' },
    oral: { label: 'Oral', color: 'bg-indigo-100 text-indigo-800' },
    preflight: { label: 'Preflight', color: 'bg-gray-100 text-gray-800' },
  };

  const { label, color } = config[source];

  return (
    <span className={cn('px-2 py-0.5 text-xs rounded', color)}>
      {label}
    </span>
  );
}

function ImpactIndicator({ impact, effort }: { impact: number; effort: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span>Impact:</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-2 h-2 rounded-full',
              i < impact ? 'bg-green-500' : 'bg-gray-200'
            )}
          />
        ))}
      </div>
      <span className="ml-2">Effort:</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-2 h-2 rounded-full',
              i < effort ? 'bg-yellow-500' : 'bg-gray-200'
            )}
          />
        ))}
      </div>
    </div>
  );
}
